import type { AssetFolder, LibraryAsset } from '../../../../../shared/assetLibrary'

export function assetFileUrl(filePath: string) {
  return `vg://file?path=${encodeURIComponent(filePath)}`
}

export function formatBytes(bytes: number) {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function pad(value: number) { return String(value).padStart(2, '0') }

export function formatDateTime(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Short relative date for dense UI: 今天 14:05 / 昨天 / 11-08 / 2025-11-08 */
export function formatShortDate(timestamp: number) {
  const date = new Date(timestamp)
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  if (timestamp >= startOfToday) return `今天 ${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (timestamp >= startOfToday - 86400000) return '昨天'
  if (date.getFullYear() === today.getFullYear()) return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function fileExtension(asset: LibraryAsset) {
  const match = /\.([a-z0-9]+)$/i.exec(asset.fileName || asset.filePath || '')
  return match ? match[1].toUpperCase() : asset.mimeType.split('/')[1]?.toUpperCase() || ''
}

/** Folder ids of `rootId` plus every descendant. */
export function descendantFolderIds(folders: AssetFolder[], rootId: string) {
  const ids = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) { ids.add(folder.id); changed = true }
    }
  }
  return ids
}

export function folderPathOf(folders: AssetFolder[], folderId: string | null | undefined) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const path: AssetFolder[] = []
  let current = folderId ? byId.get(folderId) : undefined
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return path
}
