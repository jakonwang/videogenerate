import { randomUUID } from 'node:crypto'
import { isHttpUrl, tikhubApiBase } from './tikhub'
import { detectPlatform, extractFirstUrl, parseShareLink, type ParsedVideo, type TikhubFetch } from '../../../shared/videoParserPlatforms'
import { runFfmpeg } from '../ffmpeg/runner'
import { access, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { dirname, join } from 'node:path'
import { generateThumbnailJpg } from '../media/thumbnail'
import { probeMedia } from '../ffmpeg/probe'
import { getAppPaths } from '../../lib/paths'
import { cloneRepo } from '../clone/repo'
import { videoParserDownloadRepo } from './repo'
import type { VideoParserDownloadItem } from './types'


type VideoParserDownloadServiceDeps = {
  fetchImpl: typeof fetch
  generateThumbnailJpg: typeof generateThumbnailJpg
  /** 画面和声音分开下载时合并（B 站、YouTube） */
  mergeAudioVideo: (videoPath: string, audioPath: string, outputPath: string) => Promise<void>
}

const defaultMerge = (videoPath: string, audioPath: string, outputPath: string) =>
  runFfmpeg({ args: ['-y', '-i', videoPath, '-i', audioPath, '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-movflags', '+faststart', outputPath] })

let deps: VideoParserDownloadServiceDeps = {
  fetchImpl: fetch,
  generateThumbnailJpg,
  mergeAudioVideo: defaultMerge,
}

/** 后台下载：同时最多 2 条，页面每 4 秒刷新看进度 */
const DOWNLOAD_CONCURRENCY = 2
const queue: Array<() => Promise<void>> = []
let active = 0
function enqueue(task: () => Promise<void>) {
  queue.push(task)
  const pump = () => {
    while (active < DOWNLOAD_CONCURRENCY && queue.length) {
      const next = queue.shift()!
      active += 1
      void next().finally(() => {
        active -= 1
        pump()
      })
    }
  }
  pump()
}

function now() {
  return Date.now()
}

function itemRoot(itemId: string) {
  return join(getAppPaths().dataDir, 'video-parser-download', itemId)
}

function safeName(input: string) {
  return String(input || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim()
}

function normalizeShareUrls(input: string[]) {
  return Array.from(new Set((input || []).map((item) => String(item || '').trim()).filter(Boolean)))
}

/** 同一条分享链接的标识（去掉参数），用来认出重复导入 */
function shareKey(text: string) {
  return extractFirstUrl(text).replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase()
}

function normalizeItem(item?: Partial<VideoParserDownloadItem> | null): VideoParserDownloadItem | null {
  if (!item) return null
  const userId = String(item.userId || '').trim()
  const shareUrl = String(item.shareUrl || '').trim()
  const videoId = String(item.videoId || '').trim()
  if (!userId || !shareUrl || !videoId) return null
  return {
    id: String(item.id || '').trim() || randomUUID(),
    userId,
    shareUrl,
    videoId,
    platform: item.platform || detectPlatform(shareUrl)?.platform || 'tiktok',
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

async function ensureReadable(filePath?: string) {
  const value = String(filePath || '').trim()
  if (!value) return false
  try {
    await access(value, fsConstants.R_OK)
    return true
  } catch {
    return false
  }
}

/** 检查过能播放的文件（路径 → 大小:修改时间），列表每 4 秒刷新时不用每条都重新 ffprobe */
const playableChecked = new Map<string, string>()

async function ensurePlayableVideo(filePath?: string) {
  const value = String(filePath || '').trim()
  if (!value) return false
  try {
    const info = await stat(value)
    const signature = `${info.size}:${info.mtimeMs}`
    if (playableChecked.get(value) === signature) return true
    const meta = await probeMedia(value)
    const ok = Number(meta.durationSec || 0) > 0.1 && Number(meta.width || 0) > 0 && Number(meta.height || 0) > 0
    if (ok) playableChecked.set(value, signature)
    else playableChecked.delete(value)
    return ok
  } catch {
    playableChecked.delete(value)
    return false
  }
}

async function downloadBinaryFile(url: string, targetPath: string, headers?: Record<string, string>) {
  const response = await deps.fetchImpl(url, headers ? { headers } : undefined)
  if (!response.ok) {
    throw new Error(`视频下载失败（HTTP ${response.status}），链接可能已过期，请重试`)
  }
  const arrayBuffer = await response.arrayBuffer()
  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, Buffer.from(arrayBuffer))
}

async function removeItemArtifacts(item: VideoParserDownloadItem) {
  const paths = [item.localVideoPath, item.thumbnailPath].map((itemPath) => String(itemPath || '').trim()).filter(Boolean)
  await Promise.all(
    paths.map(async (filePath) => {
      try {
        await rm(filePath, { force: true })
      } catch {
        // Ignore cleanup failures after delete.
      }
    }),
  )
  try {
    await rm(itemRoot(item.id), { recursive: true, force: true })
  } catch {
    // Ignore cleanup failures after delete.
  }
}

async function invalidateBrokenCompletedItem(item: VideoParserDownloadItem, errorMessage: string) {
  await removeItemArtifacts(item)
  return await videoParserDownloadRepo.upsertItem({
    ...item,
    downloadUrl: undefined,
    localVideoPath: undefined,
    thumbnailPath: undefined,
    status: 'failed',
    error: errorMessage,
  })
}

async function parseLink(shareText: string): Promise<ParsedVideo> {
  const credentials = await cloneRepo.getCredentials()
  const apiKey = String(credentials.tikhubApiKey || '').trim()
  if (!apiKey) throw new Error('还没有填写 TikHub 密钥，请先到设置里填写')
  return await parseShareLink({ text: shareText, apiKey, baseUrl: tikhubApiBase(), fetch: deps.fetchImpl as unknown as TikhubFetch })
}

/** 解析 + 下载一条（在后台队列里跑）：做完把记录改成完成或失败 */
async function downloadOne(input: { userId: string; shareText: string; existing: VideoParserDownloadItem }) {
  let item = input.existing
  try {
    const parsed = await parseLink(input.shareText)
    // 同一个视频已经下载好：复用文件，删掉这条重复的占位记录
    const duplicate = await videoParserDownloadRepo.getItemByVideoId(input.userId, parsed.videoId)
    if (duplicate && duplicate.id !== item.id && duplicate.status === 'completed' && (await ensureReadable(duplicate.localVideoPath)) && (await ensurePlayableVideo(duplicate.localVideoPath))) {
      await videoParserDownloadRepo.removeItem(input.userId, item.id).catch(() => undefined)
      return await videoParserDownloadRepo.upsertItem({ ...duplicate, title: parsed.title || duplicate.title, author: parsed.author || duplicate.author, coverUrl: parsed.coverUrl || duplicate.coverUrl, error: undefined })
    }
    item = await videoParserDownloadRepo.upsertItem({
      ...item,
      platform: parsed.platform,
      videoId: parsed.videoId || item.videoId,
      title: parsed.title || item.title,
      author: parsed.author || item.author,
      coverUrl: parsed.coverUrl || item.coverUrl,
      downloadUrl: parsed.downloadUrl,
      status: 'processing',
      error: undefined,
    })
    const titlePart = safeName(item.title || '').slice(0, 60) || safeName(item.videoId).slice(0, 60) || 'video'
    const itemDir = itemRoot(item.id)
    await mkdir(itemDir, { recursive: true })
    const localVideoPath = join(itemDir, `${titlePart}.mp4`)
    if (parsed.audioUrl) {
      const videoPart = join(itemDir, 'video-part.mp4')
      const audioPart = join(itemDir, 'audio-part.m4a')
      await downloadBinaryFile(parsed.downloadUrl, videoPart, parsed.downloadHeaders)
      await downloadBinaryFile(parsed.audioUrl, audioPart, parsed.downloadHeaders)
      await deps.mergeAudioVideo(videoPart, audioPart, localVideoPath)
      await Promise.all([rm(videoPart, { force: true }), rm(audioPart, { force: true })]).catch(() => undefined)
    } else {
      await downloadBinaryFile(parsed.downloadUrl, localVideoPath, parsed.downloadHeaders)
    }
    if (!(await ensurePlayableVideo(localVideoPath))) {
      await rm(localVideoPath, { force: true }).catch(() => undefined)
      throw new Error('下载到的文件不是可播放的视频，请重新复制分享链接后重试')
    }
    const thumbnailPath = await deps.generateThumbnailJpg({ filePath: localVideoPath, atSec: 0.5 })
    return await videoParserDownloadRepo.upsertItem({ ...item, localVideoPath, thumbnailPath: thumbnailPath || undefined, status: 'completed', error: undefined })
  } catch (error) {
    const message = String((error as Error)?.message || error || '未知错误').trim()
    return await videoParserDownloadRepo.upsertItem({ ...item, status: 'failed', error: message })
  }
}

/** 先建一条「下载中」的记录（页面马上能看到），再交给后台队列 */
async function startDownload(userId: string, shareText: string, existing?: VideoParserDownloadItem | null) {
  const shareUrl = extractFirstUrl(shareText) || shareText
  const placeholder = normalizeItem({
    ...(existing ?? {}),
    id: existing?.id || randomUUID(),
    userId,
    shareUrl,
    videoId: existing?.videoId || `pending:${shareKey(shareUrl) || randomUUID()}`,
    platform: existing?.platform || detectPlatform(shareUrl)?.platform,
    status: 'processing',
    error: undefined,
    usedStatus: existing?.usedStatus || 'unused',
    createdAt: existing?.createdAt || now(),
  })!
  const saved = await videoParserDownloadRepo.upsertItem(placeholder)
  enqueue(async () => {
    await downloadOne({ userId, shareText, existing: saved })
  })
  return saved
}

/**
 * 等这条下载做完（导入接口马上返回「下载中」）。同一个视频以前下过时，占位记录会被删掉、换成旧记录，
 * 所以按 videoId 再找一次。超时就返回最新的记录（仍是「下载中」）。
 */
export async function waitForVideoParserItem(input: { userId: string; item: VideoParserDownloadItem; videoId?: string; timeoutMs?: number; pollMs?: number }) {
  const deadline = Date.now() + (input.timeoutMs ?? 180_000)
  let latest = input.item
  for (;;) {
    const videoId = [latest.videoId, input.videoId].find((id) => id && !id.startsWith('pending:'))
    const current = (await videoParserDownloadRepo.getItem(input.userId, latest.id))
      ?? (videoId ? await videoParserDownloadRepo.getItemByVideoId(input.userId, videoId) : null)
    if (current) latest = current
    if (latest.status !== 'processing' || Date.now() >= deadline) return latest
    await new Promise((resolve) => setTimeout(resolve, input.pollMs ?? 1000))
  }
}

/** 测试用：等后台队列清空 */
export async function waitForVideoParserQueue() {
  while (active > 0 || queue.length) await new Promise((resolve) => setTimeout(resolve, 20))
}

export const videoParserDownloadService = {
  async initialize() {
    const all = await videoParserDownloadRepo.readDb()
    for (const item of all.items) {
      if (item.status !== 'processing') continue
      await videoParserDownloadRepo.upsertItem({
        ...item,
        status: item.localVideoPath && (await ensureReadable(item.localVideoPath)) ? 'completed' : 'failed',
        error: item.localVideoPath && (await ensureReadable(item.localVideoPath)) ? undefined : '上次下载被中断，请重试',
      })
    }
  },

  async listItems(userId: string) {
    const safeUserId = String(userId || '').trim()
    const existing = await videoParserDownloadRepo.listItems(safeUserId)
    for (const item of existing) {
      if (item.status !== 'completed') continue
      const readable = await ensureReadable(item.localVideoPath)
      const playable = readable ? await ensurePlayableVideo(item.localVideoPath) : false
      if (readable && playable) continue
      await invalidateBrokenCompletedItem(item, '视频文件丢失或损坏，请重试')
    }
    return await videoParserDownloadRepo.listItems(safeUserId)
  },

  /** 导入分享链接：每行一条（也可以整段分享文案），马上返回「下载中」的记录，下载在后台进行；同一链接不重复下载 */
  async importShareUrls(input: { userId: string; shareUrls: string[] }) {
    const userId = String(input.userId || '').trim()
    if (!userId) throw new Error('userId is required')
    const shareUrls = normalizeShareUrls(input.shareUrls)
    if (!shareUrls.length) throw new Error('shareUrls is required')
    const items: VideoParserDownloadItem[] = []
    const errors: Array<{ shareUrl: string; message: string }> = []
    const existingItems = await videoParserDownloadRepo.listItems(userId)
    const seen = new Set<string>()
    for (const raw of shareUrls) {
      const shareUrl = extractFirstUrl(raw)
      if (!shareUrl || !isHttpUrl(shareUrl)) {
        errors.push({ shareUrl: raw, message: '没有找到链接' })
        continue
      }
      if (!detectPlatform(shareUrl)) {
        errors.push({ shareUrl, message: '暂不支持这个平台的链接' })
        continue
      }
      const key = shareKey(shareUrl)
      if (seen.has(key)) continue
      seen.add(key)
      const existing = existingItems.find((item) => shareKey(item.shareUrl) === key) ?? null
      // 已下载好的直接复用；下载中的不重复提交
      if (existing && (existing.status === 'processing' || (existing.status === 'completed' && (await ensureReadable(existing.localVideoPath))))) {
        items.push(existing)
        continue
      }
      // 整段分享文案也传给接口（小红书等平台要文案）
      items.push(await startDownload(userId, raw, existing))
    }
    return {
      ok: errors.length === 0,
      items,
      errors,
    }
  },

  async retryItem(input: { userId: string; id: string }) {
    const userId = String(input.userId || '').trim()
    const id = String(input.id || '').trim()
    if (!userId || !id) throw new Error('userId and id are required')
    const current = await videoParserDownloadRepo.getItem(userId, id)
    if (!current) throw new Error('这条下载记录不存在')
    if (current.status === 'processing') return current
    return await startDownload(userId, current.shareUrl, current)
  },

  async deleteItem(input: { userId: string; id: string }) {
    const userId = String(input.userId || '').trim()
    const id = String(input.id || '').trim()
    if (!userId || !id) throw new Error('userId and id are required')
    const removed = await videoParserDownloadRepo.removeItem(userId, id)
    await removeItemArtifacts(removed)
    return { ok: true }
  },

  async markItemsUsed(input: { userId: string; ids: string[] }) {
    const userId = String(input.userId || '').trim()
    const ids = Array.from(new Set((input.ids || []).map((item) => String(item || '').trim()).filter(Boolean)))
    for (const id of ids) {
      await videoParserDownloadRepo.setUsedStatus(userId, id, 'used')
    }
    return await this.listItems(userId)
  },

  setTestDependencies(overrides: Partial<VideoParserDownloadServiceDeps>) {
    deps = {
      ...deps,
      ...overrides,
    }
  },

  resetTestDependencies() {
    deps = {
      fetchImpl: fetch,
      generateThumbnailJpg,
      mergeAudioVideo: defaultMerge,
    }
  },
}
