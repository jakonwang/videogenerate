import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import type { VideoParserDownloadDb, VideoParserDownloadItem, VideoParserUsedStatus } from './types'

function dbPath() {
  return join(getAppPaths().dbDir, 'video-parser-download.json')
}

function now() {
  return Date.now()
}

function emptyDb(): VideoParserDownloadDb {
  return { items: [] }
}

function normalizeItem(item: VideoParserDownloadItem): VideoParserDownloadItem {
  return {
    ...item,
    shareUrl: String(item.shareUrl || '').trim(),
    videoId: String(item.videoId || '').trim(),
    platform: 'tiktok',
    title: String(item.title || '').trim() || undefined,
    author: String(item.author || '').trim() || undefined,
    coverUrl: String(item.coverUrl || '').trim() || undefined,
    downloadUrl: String(item.downloadUrl || '').trim() || undefined,
    localVideoPath: String(item.localVideoPath || '').trim() || undefined,
    thumbnailPath: String(item.thumbnailPath || '').trim() || undefined,
    status: item.status === 'completed' || item.status === 'failed' ? item.status : 'processing',
    error: String(item.error || '').trim() || undefined,
    usedStatus: item.usedStatus === 'used' ? 'used' : 'unused',
    createdAt: Number(item.createdAt || now()),
    updatedAt: Number(item.updatedAt || now()),
  }
}

export const videoParserDownloadRepo = {
  async readDb() {
    const raw = await readJsonFile<VideoParserDownloadDb>(dbPath(), emptyDb())
    return {
      items: Array.isArray(raw.items) ? raw.items.map(normalizeItem) : [],
    }
  },

  async writeDb(db: VideoParserDownloadDb) {
    await writeJsonFile(dbPath(), db)
  },

  async listItems(userId: string) {
    const db = await this.readDb()
    return db.items
      .filter((item) => item.userId === userId)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
  },

  async getItem(userId: string, id: string) {
    const items = await this.listItems(userId)
    return items.find((item) => item.id === id) ?? null
  },

  async getItemByVideoId(userId: string, videoId: string) {
    const items = await this.listItems(userId)
    return items.find((item) => item.videoId === videoId) ?? null
  },

  async upsertItem(input: VideoParserDownloadItem) {
    const db = await this.readDb()
    const next = normalizeItem({
      ...input,
      updatedAt: now(),
    })
    const index = db.items.findIndex((item) => item.userId === next.userId && item.id === next.id)
    if (index >= 0) db.items[index] = next
    else db.items.unshift(next)
    await this.writeDb(db)
    return next
  },

  async removeItem(userId: string, id: string) {
    const db = await this.readDb()
    const index = db.items.findIndex((item) => item.userId === userId && item.id === id)
    if (index < 0) throw new Error('Download item does not exist')
    const removed = db.items[index]
    db.items.splice(index, 1)
    await this.writeDb(db)
    return removed
  },

  async setUsedStatus(userId: string, id: string, usedStatus: VideoParserUsedStatus) {
    const current = await this.getItem(userId, id)
    if (!current) throw new Error('Download item does not exist')
    return await this.upsertItem({
      ...current,
      usedStatus,
    })
  },
}
