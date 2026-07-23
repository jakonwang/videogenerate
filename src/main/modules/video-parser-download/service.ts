import { randomUUID } from 'node:crypto'
import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { dirname, join } from 'node:path'
import { generateThumbnailJpg } from '../media/thumbnail'
import { probeMedia } from '../ffmpeg/probe'
import { getAppPaths } from '../../lib/paths'
import { cloneRepo } from '../clone/repo'
import { videoParserDownloadRepo } from './repo'
import type { VideoParserDownloadItem } from './types'

const TIKHUB_FETCH_ONE_BY_SHARE_URL = 'https://api.tikhub.io/api/v1/tiktok/app/v3/fetch_one_video_by_share_url'

type VideoParserDownloadServiceDeps = {
  fetchImpl: typeof fetch
  generateThumbnailJpg: typeof generateThumbnailJpg
}

let deps: VideoParserDownloadServiceDeps = {
  fetchImpl: fetch,
  generateThumbnailJpg,
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

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(String(value || '').trim())
}

function isKnownNonVideoAssetUrl(value: string) {
  const text = String(value || '').trim()
  if (!text) return true
  const normalized = text.toLowerCase()
  if (
    normalized.includes('docs.tikhub.io/') ||
    normalized.includes('api.tikhub.io/#/') ||
    normalized.includes('/fetch_one_video_by_share_url')
  ) {
    return true
  }
  return /\.(?:avif|bmp|gif|heic|heif|jpeg|jpg|json|png|svg|txt|webp)(?:\?|$)/i.test(normalized)
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

function topLevelKeysOf(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.keys(value as Record<string, unknown>).slice(0, 12)
}

function getByPath(input: unknown, path: string[]) {
  let current: any = input
  for (const segment of path) {
    if (!current || typeof current !== 'object') return undefined
    current = current[segment]
  }
  return current
}

function pickFirstString(input: unknown, paths: string[][]) {
  for (const path of paths) {
    const value = getByPath(input, path)
    if (typeof value === 'string' && String(value).trim()) return String(value).trim()
  }
  return ''
}

function collectStringCandidates(input: unknown, keys: string[], output: string[], seen: Set<string>, depth = 0) {
  if (!input || depth > 4) return
  if (typeof input === 'string') {
    const text = String(input).trim()
    if (text && !seen.has(text)) {
      seen.add(text)
      output.push(text)
    }
    return
  }
  if (Array.isArray(input)) {
    for (const item of input) collectStringCandidates(item, keys, output, seen, depth + 1)
    return
  }
  if (typeof input !== 'object') return
  const record = input as Record<string, unknown>
  for (const [key, value] of Object.entries(record)) {
    if (keys.includes(key) && typeof value === 'string') {
      const text = String(value).trim()
      if (text && !seen.has(text)) {
        seen.add(text)
        output.push(text)
      }
    }
    collectStringCandidates(value, keys, output, seen, depth + 1)
  }
}

function resolveDownloadUrl(payload: unknown) {
  const direct = pickFirstString(payload, [
    ['data', 'aweme_detail', 'video', 'download_no_watermark_addr', 'url_list', '0'],
    ['data', 'aweme_detail', 'video', 'play_addr_h264', 'url_list', '0'],
    ['data', 'aweme_detail', 'video', 'play_addr', 'url_list', '0'],
    ['data', 'aweme_detail', 'video', 'download_addr', 'url_list', '0'],
    ['data', 'aweme_detail', 'video', 'download_no_watermark_addr', 'uri'],
    ['data', 'aweme_detail', 'video', 'play_addr_h264', 'uri'],
    ['data', 'aweme_detail', 'video', 'play_addr', 'uri'],
    ['data', 'aweme_detail', 'video', 'download_addr', 'uri'],
    ['data', 'video', 'play'],
    ['data', 'video', 'download_addr'],
    ['data', 'video', 'wmplay'],
    ['data', 'video_data', 'nwm_video_url'],
    ['data', 'video_data', 'play_url'],
    ['data', 'play'],
    ['data', 'download_url'],
    ['video', 'play'],
    ['video', 'download_addr'],
    ['video_data', 'nwm_video_url'],
  ])
  if (direct && isHttpUrl(direct) && !isKnownNonVideoAssetUrl(direct)) return direct
  const candidates: string[] = []
  collectStringCandidates(
    payload,
    ['play', 'download_addr', 'download_no_watermark_addr', 'wmplay', 'nwm_video_url', 'play_url', 'download_url'],
    candidates,
    new Set<string>(),
  )
  return (
    candidates.find((item) => isHttpUrl(item) && /\.mp4(\?|$)/i.test(item) && !isKnownNonVideoAssetUrl(item)) ||
    candidates.find((item) => isHttpUrl(item) && !isKnownNonVideoAssetUrl(item)) ||
    ''
  )
}

function resolveVideoId(payload: unknown) {
  return (
    pickFirstString(payload, [
      ['data', 'aweme_id'],
      ['data', 'video_id'],
      ['data', 'id'],
      ['data', 'aweme_detail', 'aweme_id'],
      ['data', 'video', 'id'],
    ]) || ''
  )
}

function resolveTitle(payload: unknown) {
  return pickFirstString(payload, [
    ['data', 'title'],
    ['data', 'desc'],
    ['data', 'aweme_detail', 'desc'],
    ['data', 'video_title'],
  ])
}

function resolveAuthor(payload: unknown) {
  return pickFirstString(payload, [
    ['data', 'author', 'nickname'],
    ['data', 'author', 'unique_id'],
    ['data', 'aweme_detail', 'author', 'nickname'],
    ['data', 'author_name'],
  ])
}

function resolveCoverUrl(payload: unknown) {
  return pickFirstString(payload, [
    ['data', 'cover'],
    ['data', 'origin_cover'],
    ['data', 'video', 'cover'],
    ['data', 'aweme_detail', 'video', 'cover', 'url_list', '0'],
    ['data', 'aweme_detail', 'video', 'origin_cover', 'url_list', '0'],
  ])
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

async function ensurePlayableVideo(filePath?: string) {
  const value = String(filePath || '').trim()
  if (!value) return false
  try {
    const meta = await probeMedia(value)
    return Number(meta.durationSec || 0) > 0.1 && Number(meta.width || 0) > 0 && Number(meta.height || 0) > 0
  } catch {
    return false
  }
}

async function downloadBinaryFile(url: string, targetPath: string) {
  const response = await deps.fetchImpl(url)
  if (!response.ok) {
    throw new Error(`Video download failed: HTTP ${response.status}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, Buffer.from(arrayBuffer))
}

async function fetchTikHubPayload(apiKey: string, shareUrl: string) {
  const url = new URL(TIKHUB_FETCH_ONE_BY_SHARE_URL)
  url.searchParams.set('share_url', shareUrl)
  const response = await deps.fetchImpl(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`TikHub request failed: HTTP ${response.status} ${text.slice(0, 240)}`)
  }
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('TikHub response is not valid JSON')
  }
  const code = Number(json?.code ?? 0)
  if (Number.isFinite(code) && code !== 200 && code !== 0) {
    throw new Error(String(json?.message || json?.msg || `TikHub returned code ${code}`))
  }
  return json
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

async function upsertProcessingItem(input: {
  userId: string
  shareUrl: string
  item?: VideoParserDownloadItem | null
  payload?: unknown
}) {
  const existing = input.item
  const videoId = resolveVideoId(input.payload) || String(existing?.videoId || '').trim()
  if (!videoId) throw new Error('TikHub response did not include a video id')
  const normalized = normalizeItem({
    id: existing?.id || randomUUID(),
    userId: input.userId,
    shareUrl: input.shareUrl,
    videoId,
    title: resolveTitle(input.payload) || existing?.title,
    author: resolveAuthor(input.payload) || existing?.author,
    coverUrl: resolveCoverUrl(input.payload) || existing?.coverUrl,
    downloadUrl: resolveDownloadUrl(input.payload) || existing?.downloadUrl,
    localVideoPath: existing?.localVideoPath,
    thumbnailPath: existing?.thumbnailPath,
    status: 'processing',
    error: undefined,
    usedStatus: existing?.usedStatus || 'unused',
    createdAt: existing?.createdAt || now(),
  })
  if (!normalized) throw new Error('Failed to normalize download item')
  return await videoParserDownloadRepo.upsertItem(normalized)
}

async function downloadOne(input: { userId: string; shareUrl: string; existing?: VideoParserDownloadItem | null }) {
  const credentials = await cloneRepo.getCredentials()
  const apiKey = String(credentials.tikhubApiKey || '').trim()
  if (!apiKey) throw new Error('TikHub API key is missing. Please set it in Settings first.')

  const payload = await fetchTikHubPayload(apiKey, input.shareUrl)
  const videoId = resolveVideoId(payload)
  if (!videoId) {
    throw new Error(`TikHub response is missing video id. Keys: ${topLevelKeysOf(payload).join(', ')}`)
  }

  const deduped = (await videoParserDownloadRepo.getItemByVideoId(input.userId, videoId)) ?? input.existing ?? null
  if (deduped?.status === 'completed' && (await ensureReadable(deduped.localVideoPath)) && (await ensurePlayableVideo(deduped.localVideoPath))) {
    return await videoParserDownloadRepo.upsertItem({
      ...deduped,
      shareUrl: input.shareUrl,
      title: resolveTitle(payload) || deduped.title,
      author: resolveAuthor(payload) || deduped.author,
      coverUrl: resolveCoverUrl(payload) || deduped.coverUrl,
      downloadUrl: resolveDownloadUrl(payload) || deduped.downloadUrl,
      error: undefined,
    })
  }
  const processingItem = await upsertProcessingItem({
    userId: input.userId,
    shareUrl: input.shareUrl,
    item: deduped,
    payload,
  })

  const downloadUrl = String(processingItem.downloadUrl || '').trim()
  if (!downloadUrl || !isHttpUrl(downloadUrl)) {
    throw new Error(`TikHub response is missing a playable MP4 URL. Keys: ${topLevelKeysOf(payload).join(', ')}`)
  }

  const titlePart = safeName(processingItem.title || processingItem.videoId || 'tiktok-video') || processingItem.videoId
  const itemDir = itemRoot(processingItem.id)
  await mkdir(itemDir, { recursive: true })
  const localVideoPath = join(itemDir, `${titlePart}.mp4`)
  await downloadBinaryFile(downloadUrl, localVideoPath)
  const playable = await ensurePlayableVideo(localVideoPath)
  if (!playable) {
    try {
      await rm(localVideoPath, { force: true })
    } catch {
      // Ignore invalid-file cleanup failures before surfacing the real error.
    }
    throw new Error('Downloaded file is not a playable video. Please retry after refreshing the share link.')
  }
  const thumbnailPath = await deps.generateThumbnailJpg({ filePath: localVideoPath, atSec: 0.5 })

  return await videoParserDownloadRepo.upsertItem({
    ...processingItem,
    localVideoPath,
    thumbnailPath: thumbnailPath || undefined,
    status: 'completed',
    error: undefined,
  })
}

export const videoParserDownloadService = {
  async initialize() {
    const all = await videoParserDownloadRepo.readDb()
    for (const item of all.items) {
      if (item.status !== 'processing') continue
      await videoParserDownloadRepo.upsertItem({
        ...item,
        status: item.localVideoPath && (await ensureReadable(item.localVideoPath)) ? 'completed' : 'failed',
        error: item.localVideoPath && (await ensureReadable(item.localVideoPath)) ? undefined : 'Interrupted during previous download run',
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
      await invalidateBrokenCompletedItem(item, 'Downloaded file is not a playable video. Please retry.')
    }
    return await videoParserDownloadRepo.listItems(safeUserId)
  },

  async importShareUrls(input: { userId: string; shareUrls: string[] }) {
    const userId = String(input.userId || '').trim()
    if (!userId) throw new Error('userId is required')
    const shareUrls = normalizeShareUrls(input.shareUrls)
    if (!shareUrls.length) throw new Error('shareUrls is required')
    const items: VideoParserDownloadItem[] = []
    const errors: Array<{ shareUrl: string; message: string }> = []
    for (const shareUrl of shareUrls) {
      try {
        if (!isHttpUrl(shareUrl)) throw new Error('Share link must start with http or https')
        const completed = await downloadOne({ userId, shareUrl })
        items.push(completed)
      } catch (error: any) {
        const message = String(error?.message || error || 'Unknown error').trim()
        errors.push({ shareUrl, message })
        const existing = (await videoParserDownloadRepo.listItems(userId)).find((item) => item.shareUrl === shareUrl) ?? null
        const fallbackVideoId = String(existing?.videoId || '').trim() || randomUUID()
        await videoParserDownloadRepo.upsertItem({
          id: existing?.id || randomUUID(),
          userId,
          shareUrl,
          videoId: fallbackVideoId,
          platform: 'tiktok',
          title: existing?.title,
          author: existing?.author,
          coverUrl: existing?.coverUrl,
          downloadUrl: existing?.downloadUrl,
          localVideoPath: existing?.localVideoPath,
          thumbnailPath: existing?.thumbnailPath,
          status: 'failed',
          error: message,
          usedStatus: existing?.usedStatus || 'unused',
          createdAt: existing?.createdAt || now(),
          updatedAt: now(),
        })
      }
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
    if (!current) throw new Error('Download item does not exist')
    return await downloadOne({ userId, shareUrl: current.shareUrl, existing: current })
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
    }
  },
}
