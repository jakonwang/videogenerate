import { computed, ref, watch } from 'vue'
import { SYNC_COLLECTIONS, type SyncAsset } from '@shared/cloud/sync'
import { deleteRecord, listRecords, newId, saveRecord, syncState } from './sync'
import { cloud } from './session'

/**
 * 素材库：自己上传、反复使用的视频 / 图片 / 音频。文件存在同步空间（计入每人的空间配额），
 * 记录同步到手机和网页版；各处的「选视频」都能直接从这里选。
 */

export type AssetItem = SyncAsset & { id: string; updatedAt: number; pending: boolean }
export type AssetKind = SyncAsset['kind']

export const ASSET_KIND_LABEL: Record<AssetKind, string> = { video: '视频', image: '图片', audio: '音频' }
export const ASSET_ACCEPT = 'video/*,image/*,audio/*'
const MAX_ASSET_BYTES = 200 * 1024 * 1024

export function useAssets(filter?: (item: AssetItem) => boolean) {
  const all = ref<AssetItem[]>([])
  /** 回收站里的素材（各处都不显示，只在素材库的回收站里） */
  const trashed = ref<AssetItem[]>([])
  const loading = ref(true)
  async function load() {
    const records = await listRecords<SyncAsset>(SYNC_COLLECTIONS.assets)
    const rows = records
      .filter((record) => record.data)
      .map((record) => ({ ...(record.data as SyncAsset), id: record.id, updatedAt: record.updatedAt, pending: record.dirty }))
      .sort((a, b) => b.createdAt - a.createdAt)
    all.value = rows.filter((row) => !row.trashedAt)
    trashed.value = rows.filter((row) => row.trashedAt).sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0))
    loading.value = false
  }
  watch(() => syncState.version, load, { immediate: true })
  const items = computed(() => (filter ? all.value.filter(filter) : all.value))
  const folders = computed(() => [...new Set(all.value.map((item) => item.folder || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')))
  return { items, all, trashed, folders, loading, reload: load }
}

export function kindOf(file: { type: string; name: string }): AssetKind | null {
  const type = file.type.toLowerCase()
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('audio/')) return 'audio'
  const ext = file.name.toLowerCase().split('.').pop() || ''
  if (['mp4', 'mov', 'm4v', 'webm', 'mkv'].includes(ext)) return 'video'
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image'
  if (['mp3', 'm4a', 'aac', 'wav', 'ogg'].includes(ext)) return 'audio'
  return null
}

const DEFAULT_MIME: Record<AssetKind, string> = { video: 'video/mp4', image: 'image/jpeg', audio: 'audio/mpeg' }

type Probe = Pick<SyncAsset, 'durationSec' | 'width' | 'height'> & { poster?: Blob }

/**
 * Reads duration / size in the browser and, for videos, grabs one frame as a small JPEG cover —
 * the library grid then loads ~30 KB covers instead of whole videos.
 */
function probe(file: File, kind: AssetKind): Promise<Probe> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    let settled = false
    const done = (value: Probe) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      resolve(value)
    }
    const timer = setTimeout(() => done({}), 10_000)
    if (kind === 'image') {
      const img = new Image()
      img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => done({})
      img.src = url
      return
    }
    if (kind === 'audio') {
      const audio = document.createElement('audio')
      audio.preload = 'metadata'
      audio.onloadedmetadata = () => done({ durationSec: Number.isFinite(audio.duration) ? Math.round(audio.duration * 10) / 10 : undefined })
      audio.onerror = () => done({})
      audio.src = url
      return
    }
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    const meta = () => ({
      durationSec: Number.isFinite(video.duration) ? Math.round(video.duration * 10) / 10 : undefined,
      width: video.videoWidth || undefined,
      height: video.videoHeight || undefined,
    })
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.8, (video.duration || 1) / 3)
    }
    video.onseeked = () => {
      const info = meta()
      const scale = Math.min(1, 480 / Math.max(video.videoWidth || 1, video.videoHeight || 1))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round((video.videoWidth || 1) * scale))
      canvas.height = Math.max(1, Math.round((video.videoHeight || 1) * scale))
      try {
        canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => done({ ...info, poster: blob || undefined }), 'image/jpeg', 0.78)
      } catch {
        done(info)
      }
    }
    video.onerror = () => done({})
    video.src = url
  })
}

/** 文件夹路径最长字数（多层文件夹「A / B / C」） */
export const ASSET_FOLDER_MAX = 120

/** Uploads one file into the library. Files are content-addressed, so re-uploading costs no extra space. */
export async function uploadAsset(file: File, folder = ''): Promise<AssetItem> {
  const kind = kindOf(file)
  if (!kind) throw new Error(`「${file.name}」不是视频、图片或音频`)
  if (file.size > MAX_ASSET_BYTES) throw new Error(`「${file.name}」超过 200MB，请先压缩或剪短`)
  const mime = file.type || DEFAULT_MIME[kind]
  const [uploaded, { poster, ...meta }] = await Promise.all([cloud.sync.uploadFile(file, mime), probe(file, kind)])
  const posterFileId = poster ? (await cloud.sync.uploadFile(poster, 'image/jpeg').catch(() => null))?.fileId : undefined
  const id = newId('asset')
  const asset: SyncAsset = {
    name: file.name.replace(/\.[^.]+$/, '').slice(0, 80) || ASSET_KIND_LABEL[kind],
    kind,
    fileId: uploaded.fileId,
    mime: uploaded.mime || mime,
    size: uploaded.size || file.size,
    folder: folder.trim().slice(0, ASSET_FOLDER_MAX) || undefined,
    ...meta,
    posterFileId,
    createdAt: Date.now(),
  }
  await saveRecord(SYNC_COLLECTIONS.assets, id, asset)
  return { ...asset, id, updatedAt: Date.now(), pending: true }
}

/** 上传一个视频给工具用（不进素材库）：顺便读时长 / 尺寸、截一帧封面 */
export type UploadedVideo = { fileId: string; name: string; mime: string; size: number; durationSec?: number; width?: number; height?: number; posterFileId?: string }
export async function uploadVideo(file: File): Promise<UploadedVideo> {
  if (kindOf(file) !== 'video') throw new Error(`「${file.name}」不是视频`)
  if (file.size > MAX_ASSET_BYTES) throw new Error(`「${file.name}」超过 200MB，请先压缩或剪短`)
  const mime = file.type || DEFAULT_MIME.video
  const [uploaded, { poster, ...meta }] = await Promise.all([cloud.sync.uploadFile(file, mime), probe(file, 'video')])
  const posterFileId = poster ? (await cloud.sync.uploadFile(poster, 'image/jpeg').catch(() => null))?.fileId : undefined
  return { fileId: uploaded.fileId, name: file.name, mime, size: uploaded.size || file.size, ...meta, posterFileId }
}

/** Saves an already uploaded cloud file (e.g. an AI result) into the library. */
export async function addFileToAssets(input: { fileId: string; mime?: string; name: string; kind: AssetKind; folder?: string }) {
  const id = newId('asset')
  await saveRecord<SyncAsset>(SYNC_COLLECTIONS.assets, id, {
    name: input.name.slice(0, 80),
    kind: input.kind,
    fileId: input.fileId,
    mime: input.mime || DEFAULT_MIME[input.kind],
    size: 0,
    folder: input.folder?.trim().slice(0, ASSET_FOLDER_MAX) || undefined,
    createdAt: Date.now(),
  })
  return id
}

export async function updateAsset(item: AssetItem, patch: Partial<Pick<SyncAsset, 'name' | 'folder'>>) {
  const { id, updatedAt: _u, pending: _p, ...data } = item
  const next: SyncAsset = { ...data, ...patch }
  next.name = String(next.name || '').trim().slice(0, 80) || item.name
  next.folder = String(next.folder || '').trim().slice(0, ASSET_FOLDER_MAX) || undefined
  await saveRecord(SYNC_COLLECTIONS.assets, id, next)
}

/** 移入回收站 / 从回收站恢复：只是打个标记，文件和记录都还在 */
export async function setTrashed(item: AssetItem, trashed: boolean) {
  const { id, updatedAt: _u, pending: _p, ...data } = item
  const next: SyncAsset = { ...data }
  if (trashed) next.trashedAt = Date.now()
  else delete next.trashedAt
  await saveRecord(SYNC_COLLECTIONS.assets, id, next)
}

/** Removes the library entry. The file itself stays while anything else (a project, a result) still uses it. */
export async function removeAsset(item: AssetItem) {
  await deleteRecord(SYNC_COLLECTIONS.assets, item.id)
}

export function formatBytes(bytes: number) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function formatDuration(sec?: number) {
  if (!sec) return ''
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
