import { randomBytes, randomUUID } from 'node:crypto'
import { copyFile, cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import os from 'node:os'
import http from 'node:http'
import sharp from 'sharp'
import { getAppPaths } from '../../lib/paths'
import type { AssetFolder, AssetLibraryIndex, LibraryAsset } from '../../../shared/assetLibrary'
export type { AssetFolder, LibraryAsset } from '../../../shared/assetLibrary'
import type { AssetImageEditInput } from '../../../shared/assetLibrary'
import type { ModelCredentials } from '../clone/types'
import { toPublicUrlViaQiniu } from '../clone/qiniu'
import { generateThumbnailJpg } from '../media/thumbnail'

type UploadSession = { token: string; expiresAt: number; count: number }
const SESSION_TTL_MS = 15 * 60 * 1000
const MAX_FILE_BYTES = 100 * 1024 * 1024
const MAX_SESSION_UPLOADS = 50
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.mov', '.webm', '.mkv'])
const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
}

function roots() {
  const root = join(getAppPaths().dataDir, 'asset-library')
  return { root, files: join(root, 'files'), index: join(root, 'index.json') }
}

function isInside(root: string, candidate: string) {
  const suffix = relative(resolve(root), resolve(candidate))
  return suffix === '' || (!suffix.startsWith('..') && !isAbsolute(suffix))
}

function cleanName(value: string) {
  return basename(String(value || 'asset').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')).slice(0, 180) || 'asset'
}

class AssetLibraryService {
  private qiniuCredentials: ModelCredentials | null = null
  private sessions = new Map<string, UploadSession>()
  private server: http.Server | null = null
  private port: number | null = null

  private async readIndex(): Promise<AssetLibraryIndex> {
    const { index } = roots()
    try {
      const parsed = JSON.parse(await readFile(index, 'utf8'))
      if (Array.isArray(parsed)) {
        return { assets: parsed.filter((item) => item && typeof item.id === 'string'), folders: [] }
      }
      return {
        assets: Array.isArray(parsed?.assets) ? parsed.assets.filter((item: LibraryAsset) => item && typeof item.id === 'string') : [],
        folders: Array.isArray(parsed?.folders) ? parsed.folders.filter((item: AssetFolder) => item && typeof item.id === 'string') : [],
      }
    } catch { return { assets: [], folders: [] } }
  }

  private async writeIndex(items: AssetLibraryIndex) {
    const { index } = roots()
    await mkdir(join(index, '..'), { recursive: true })
    const temporary = `${index}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(items, null, 2), 'utf8')
    await rename(temporary, index)
  }

  setQiniuCredentials(credentials?: ModelCredentials | null) {
    this.qiniuCredentials = credentials || null
  }

  async list(query = '', type: 'all' | 'image' | 'video' = 'all', folderId?: string | null) {
    const index = await this.readIndex()
    const items = index.assets
    let repaired = false
    await Promise.all(items.map(async (item) => {
      try {
        const fileStat = await stat(item.filePath)
        const originalCreatedAt = Math.round(fileStat.birthtimeMs)
        if (originalCreatedAt > 946684800000 && originalCreatedAt + 1000 < item.createdAt) {
          item.createdAt = originalCreatedAt
          repaired = true
        }
      } catch { /* Missing files remain visible until explicitly removed. */ }
    }))
    if (repaired) await this.writeIndex(index)
    const needle = query.trim().toLocaleLowerCase()
    return items.filter((item) => !item.deletedAt && (folderId === undefined || (item.folderId || null) === folderId) && (type === 'all' || item.type === type) && (!needle || item.name.toLocaleLowerCase().includes(needle)))
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  async importFile(sourcePath: string, source: 'desktop' | 'mobile' = 'desktop', originalName?: string, folderId: string | null = null) {
    const sourceStat = await stat(sourcePath)
    if (!sourceStat.isFile() || sourceStat.size <= 0 || sourceStat.size > MAX_FILE_BYTES) throw new Error('File must be between 1 byte and 100 MB.')
    const fileName = cleanName(originalName || basename(sourcePath))
    const extension = extname(fileName).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('Only common image and video formats are supported.')
    const { files } = roots()
    await mkdir(files, { recursive: true })
    const id = randomUUID()
    const targetPath = join(files, `${id}${extension}`)
    await copyFile(sourcePath, targetPath)
    const index = await this.readIndex()
    if (folderId && !index.folders.some((folder) => folder.id === folderId)) throw new Error('Folder not found.')
    const item: LibraryAsset = {
      id, name: fileName, fileName, filePath: targetPath,
      type: extension.match(/^\.(jpg|jpeg|png|webp|gif)$/) ? 'image' : 'video',
      mimeType: MIME_BY_EXT[extension], size: sourceStat.size, source, createdAt: Date.now(), folderId,
    }
    if (this.qiniuCredentials) {
      try {
        item.qiniuUrl = await toPublicUrlViaQiniu(this.qiniuCredentials, targetPath, 'asset-library')
      } catch (error) {
        item.qiniuError = String((error as Error)?.message || error)
      }
    }
    index.assets.push(item)
    await this.writeIndex(index)
    return item
  }

  async remove(id: string) {
    const index = await this.readIndex()
    const item = index.assets.find((row) => row.id === id)
    if (!item) return false
    if (!isInside(roots().files, item.filePath)) throw new Error('Asset path is outside the managed library.')
    await rm(item.filePath, { force: true })
    index.assets = index.assets.filter((row) => row.id !== id)
    await this.writeIndex(index)
    return true
  }

  async removeMany(ids: string[]) {
    const index = await this.readIndex()
    const selected = new Set(ids.map(String))
    const removed = index.assets.filter((item) => selected.has(item.id))
    for (const item of removed) {
      if (!isInside(roots().files, item.filePath)) throw new Error('Asset path is outside the managed library.')
      await rm(item.filePath, { force: true })
    }
    index.assets = index.assets.filter((item) => !selected.has(item.id))
    await this.writeIndex(index)
    return removed.length
  }

  async renameAsset(id: string, name: string) {
    const index = await this.readIndex()
    const item = index.assets.find((asset) => asset.id === id)
    if (!item) throw new Error('Asset not found.')
    const normalizedName = cleanName(name).trim()
    if (!normalizedName || normalizedName === 'asset') throw new Error('Asset name is required.')
    item.name = normalizedName
    item.fileName = normalizedName
    await this.writeIndex(index)
    return item
  }

  async copyAssets(ids: string[], folderId: string | null) {
    const index = await this.readIndex()
    if (folderId && !index.folders.some((folder) => folder.id === folderId)) throw new Error('Folder not found.')
    const selected = new Set(ids.map(String))
    const sources = index.assets.filter((asset) => selected.has(asset.id))
    const copies: LibraryAsset[] = []
    await mkdir(roots().files, { recursive: true })
    for (const source of sources) {
      if (!isInside(roots().files, source.filePath)) throw new Error('Asset path is outside the managed library.')
      const id = randomUUID()
      const extension = extname(source.filePath).toLowerCase()
      const targetPath = join(roots().files, `${id}${extension}`)
      await copyFile(source.filePath, targetPath)
      const copy: LibraryAsset = { ...source, id, name: this.uniqueCopyName(index.assets.concat(copies), source.name, folderId), filePath: targetPath, folderId, createdAt: Date.now(), qiniuUrl: undefined, qiniuError: undefined }
      copy.fileName = copy.name
      copies.push(copy)
    }
    index.assets.push(...copies)
    await this.writeIndex(index)
    return copies
  }

  private uniqueCopyName(items: LibraryAsset[], name: string, folderId: string | null) {
    const extension = extname(name)
    const stem = extension ? name.slice(0, -extension.length) : name
    const names = new Set(items.filter((item) => (item.folderId || null) === folderId).map((item) => item.name.toLocaleLowerCase()))
    let index = 1
    let candidate = `${stem} - Copy${extension}`
    while (names.has(candidate.toLocaleLowerCase())) { index += 1; candidate = `${stem} - Copy (${index})${extension}` }
    return candidate
  }

  async updateUsageStatus(id: string, pluginId: string, usageStatus: 'used' | 'unused') {
    const normalizedPluginId = String(pluginId || '').trim()
    if (!normalizedPluginId || normalizedPluginId.length > 80 || !/^[a-z0-9-]+$/.test(normalizedPluginId)) {
      throw new Error('A valid plugin id is required.')
    }
    if (usageStatus !== 'used' && usageStatus !== 'unused') throw new Error('Invalid usage status.')
    const index = await this.readIndex()
    const item = index.assets.find((row) => row.id === id)
    if (!item) throw new Error('Asset not found.')
    item.pluginUsage = { ...item.pluginUsage, [normalizedPluginId]: usageStatus }
    await this.writeIndex(index)
    return item
  }

  async thumbnail(id: string) {
    const item = (await this.readIndex()).assets.find((row) => row.id === id)
    if (!item) throw new Error('Asset not found.')
    if (!isInside(roots().files, item.filePath)) throw new Error('Asset path is outside the managed library.')
    if (item.type === 'video') {
      const thumbnailPath = await generateThumbnailJpg({ filePath: item.filePath, atSec: 0.5, width: 480, height: 360 })
      if (!thumbnailPath) throw new Error('Video thumbnail generation failed.')
      const thumbnail = await readFile(thumbnailPath)
      return `data:image/jpeg;base64,${thumbnail.toString('base64')}`
    }
    const buffer = await readFile(item.filePath)
    const thumbnail = await sharp(buffer).rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 76 }).toBuffer()
    return `data:image/webp;base64,${thumbnail.toString('base64')}`
  }

  async editImage(id: string, input: AssetImageEditInput) {
    const index = await this.readIndex()
    const item = index.assets.find((row) => row.id === id && row.type === 'image')
    if (!item) throw new Error('Image asset not found.')
    if (!isInside(roots().files, item.filePath)) throw new Error('Asset path is outside the managed library.')
    const sourceBuffer = await readFile(item.filePath)
    const metadata = await sharp(sourceBuffer).metadata()
    const imageWidth = Number(metadata.width || 0)
    const imageHeight = Number(metadata.height || 0)
    if (!imageWidth || !imageHeight) throw new Error('Image dimensions are unavailable.')
    const validateRegion = (region: { left: number; top: number; width: number; height: number }, label: string) => {
      const values = [region.left, region.top, region.width, region.height].map(Number)
      if (!values.every((value) => Number.isInteger(value) && value >= 0)) throw new Error(`${label} coordinates must be non-negative integers.`)
      if (region.width <= 0 || region.height <= 0 || region.left + region.width > imageWidth || region.top + region.height > imageHeight) {
        throw new Error(`${label} region must stay inside the original image.`)
      }
    }
    const operations = [input.crop, input.removeWatermark].filter(Boolean)
    if (operations.length > 1) throw new Error('Choose either crop or watermark removal for one edit.')
    if (input.crop) validateRegion(input.crop, 'Crop')
    if (input.removeWatermark) validateRegion(input.removeWatermark, 'Watermark')
    const resize = input.resize
    if (resize && (!Number.isInteger(Number(resize.width)) || !Number.isInteger(Number(resize.height)) || Number(resize.width) <= 0 || Number(resize.height) <= 0 || Number(resize.width) > 12000 || Number(resize.height) > 12000)) {
      throw new Error('Resize dimensions must be integers between 1 and 12000.')
    }
    let pipeline = sharp(sourceBuffer).rotate()
    if (input.crop) pipeline = pipeline.extract(input.crop)
    if (input.removeWatermark) {
      const region = input.removeWatermark
      const blur = Math.max(1, Math.min(100, Number(region.blur || 18)))
      const patch = await sharp(sourceBuffer).extract(region).blur(blur).toBuffer()
      pipeline = pipeline.composite([{ input: patch, left: region.left, top: region.top }])
    }
    if (resize) pipeline = pipeline.resize(resize.width, resize.height, { fit: resize.fit || 'contain', background: '#ffffff' })
    const temporary = `${item.filePath}.${randomUUID()}.edit.tmp`
    try {
      await pipeline.toFile(temporary)
      await copyFile(temporary, item.filePath)
    } finally {
      await rm(temporary, { force: true })
    }
    const updatedStat = await stat(item.filePath)
    item.size = updatedStat.size
    item.qiniuError = undefined
    if (this.qiniuCredentials) {
      try { item.qiniuUrl = await toPublicUrlViaQiniu(this.qiniuCredentials, item.filePath, 'asset-library') }
      catch (error) { item.qiniuError = String((error as Error)?.message || error) }
    }
    await this.writeIndex(index)
    return item
  }

  async listFolders(parentId: string | null = null) {
    const index = await this.readIndex()
    return index.folders.filter((folder) => !folder.deletedAt && folder.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name))
  }

  async listAllFolders() {
    const index = await this.readIndex()
    return index.folders.filter((folder) => !folder.deletedAt).sort((a, b) => a.name.localeCompare(b.name))
  }

  async getFolderPath(folderId: string | null) {
    if (!folderId) return []
    const index = await this.readIndex()
    const path: AssetFolder[] = []
    const visited = new Set<string>()
    let current = index.folders.find((folder) => folder.id === folderId)
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      path.unshift(current)
      current = current.parentId ? index.folders.find((folder) => folder.id === current?.parentId) : undefined
    }
    return path
  }

  async createFolder(name: string, parentId: string | null = null) {
    const index = await this.readIndex()
    const normalizedName = cleanName(name).trim()
    if (!normalizedName || normalizedName === 'asset') throw new Error('Folder name is required.')
    if (parentId && !index.folders.some((folder) => folder.id === parentId)) throw new Error('Parent folder not found.')
    if (index.folders.some((folder) => folder.parentId === parentId && folder.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) throw new Error('A folder with this name already exists.')
    const now = Date.now()
    const folder: AssetFolder = { id: randomUUID(), name: normalizedName, parentId, createdAt: now, updatedAt: now }
    index.folders.push(folder)
    await this.writeIndex(index)
    return folder
  }

  async renameFolder(id: string, name: string) {
    const index = await this.readIndex()
    const folder = index.folders.find((item) => item.id === id)
    if (!folder) throw new Error('Folder not found.')
    const normalizedName = cleanName(name).trim()
    if (!normalizedName || normalizedName === 'asset') throw new Error('Folder name is required.')
    if (index.folders.some((item) => item.id !== id && item.parentId === folder.parentId && item.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) throw new Error('A folder with this name already exists.')
    folder.name = normalizedName
    folder.updatedAt = Date.now()
    await this.writeIndex(index)
    return folder
  }

  async removeFolder(id: string) {
    const index = await this.readIndex()
    if (!index.folders.some((folder) => folder.id === id)) return false
    const ids = new Set([id])
    let changed = true
    while (changed) {
      changed = false
      for (const folder of index.folders) if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) { ids.add(folder.id); changed = true }
    }
    const removedAssets = index.assets.filter((asset) => asset.folderId && ids.has(asset.folderId))
    for (const asset of removedAssets) {
      if (!isInside(roots().files, asset.filePath)) throw new Error('Asset path is outside the managed library.')
      await rm(asset.filePath, { force: true })
    }
    index.assets = index.assets.filter((asset) => !asset.folderId || !ids.has(asset.folderId))
    index.folders = index.folders.filter((folder) => !ids.has(folder.id))
    await this.writeIndex(index)
    return true
  }

  async moveAssets(ids: string[], folderId: string | null) {
    const index = await this.readIndex()
    if (folderId && !index.folders.some((folder) => folder.id === folderId)) throw new Error('Folder not found.')
    const selected = new Set(ids.map(String))
    const moved = index.assets.filter((asset) => selected.has(asset.id))
    moved.forEach((asset) => { asset.folderId = folderId })
    await this.writeIndex(index)
    return moved
  }

  async moveFolder(id: string, parentId: string | null) {
    const index = await this.readIndex()
    const folder = index.folders.find((item) => item.id === id)
    if (!folder) throw new Error('Folder not found.')
    if (parentId === id) throw new Error('A folder cannot be moved into itself.')
    if (parentId && !index.folders.some((item) => item.id === parentId)) throw new Error('Parent folder not found.')
    let cursor = parentId ? index.folders.find((item) => item.id === parentId) : undefined
    const visited = new Set<string>()
    while (cursor && !visited.has(cursor.id)) {
      if (cursor.id === id) throw new Error('A folder cannot be moved into its descendant.')
      visited.add(cursor.id)
      cursor = cursor.parentId ? index.folders.find((item) => item.id === cursor?.parentId) : undefined
    }
    if (index.folders.some((item) => item.id !== id && item.parentId === parentId && item.name.toLocaleLowerCase() === folder.name.toLocaleLowerCase())) throw new Error('A folder with this name already exists.')
    folder.parentId = parentId
    folder.updatedAt = Date.now()
    await this.writeIndex(index)
    return folder
  }

  async folderStats(id: string) {
    const index = await this.readIndex()
    if (!index.folders.some((folder) => folder.id === id && !folder.deletedAt)) throw new Error('Folder not found.')
    const folderIds = new Set([id])
    let changed = true
    while (changed) {
      changed = false
      for (const folder of index.folders) if (!folder.deletedAt && folder.parentId && folderIds.has(folder.parentId) && !folderIds.has(folder.id)) { folderIds.add(folder.id); changed = true }
    }
    const assets = index.assets.filter((asset) => !asset.deletedAt && asset.folderId && folderIds.has(asset.folderId))
    return { folderCount: folderIds.size, assetCount: assets.length, totalSize: assets.reduce((sum, asset) => sum + asset.size, 0) }
  }

  async trashAssets(ids: string[]) {
    const index = await this.readIndex()
    const selected = new Set(ids.map(String))
    const now = Date.now()
    const trashed = index.assets.filter((asset) => selected.has(asset.id) && !asset.deletedAt)
    trashed.forEach((asset) => { asset.originalFolderId = asset.folderId || null; asset.deletedAt = now })
    await this.writeIndex(index)
    return trashed
  }

  async trashFolder(id: string) {
    const index = await this.readIndex()
    const root = index.folders.find((folder) => folder.id === id && !folder.deletedAt)
    if (!root) throw new Error('Folder not found.')
    const folderIds = new Set([id])
    let changed = true
    while (changed) {
      changed = false
      for (const folder of index.folders) if (!folder.deletedAt && folder.parentId && folderIds.has(folder.parentId) && !folderIds.has(folder.id)) { folderIds.add(folder.id); changed = true }
    }
    const now = Date.now()
    for (const folder of index.folders) if (folderIds.has(folder.id)) { folder.originalParentId = folder.parentId; folder.deletedAt = now }
    for (const asset of index.assets) if (!asset.deletedAt && asset.folderId && folderIds.has(asset.folderId)) { asset.originalFolderId = asset.folderId; asset.deletedAt = now }
    await this.writeIndex(index)
    return { folderIds: [...folderIds] }
  }

  async listTrash() {
    const index = await this.readIndex()
    return {
      assets: index.assets.filter((asset) => Boolean(asset.deletedAt)).sort((a, b) => Number(b.deletedAt) - Number(a.deletedAt)),
      folders: index.folders.filter((folder) => Boolean(folder.deletedAt) && (!folder.originalParentId || !index.folders.some((parent) => parent.id === folder.originalParentId && parent.deletedAt))).sort((a, b) => Number(b.deletedAt) - Number(a.deletedAt)),
    }
  }

  async restoreTrash(kind: 'asset' | 'folder', id: string) {
    const index = await this.readIndex()
    if (kind === 'asset') {
      const asset = index.assets.find((item) => item.id === id && item.deletedAt)
      if (!asset) throw new Error('Trashed asset not found.')
      asset.folderId = asset.originalFolderId && index.folders.some((folder) => folder.id === asset.originalFolderId && !folder.deletedAt) ? asset.originalFolderId : null
      asset.deletedAt = undefined
      asset.originalFolderId = undefined
    } else {
      const root = index.folders.find((folder) => folder.id === id && folder.deletedAt)
      if (!root) throw new Error('Trashed folder not found.')
      const restoreIds = new Set([id])
      let changed = true
      while (changed) {
        changed = false
        for (const folder of index.folders) if (folder.deletedAt && folder.originalParentId && restoreIds.has(folder.originalParentId) && !restoreIds.has(folder.id)) { restoreIds.add(folder.id); changed = true }
      }
      for (const folder of index.folders) if (restoreIds.has(folder.id)) { folder.parentId = folder.id === id && folder.originalParentId && !index.folders.some((parent) => parent.id === folder.originalParentId && !parent.deletedAt) ? null : folder.originalParentId || null; folder.deletedAt = undefined; folder.originalParentId = undefined }
      for (const asset of index.assets) if (asset.deletedAt && asset.originalFolderId && restoreIds.has(asset.originalFolderId)) { asset.folderId = asset.originalFolderId; asset.deletedAt = undefined; asset.originalFolderId = undefined }
    }
    await this.writeIndex(index)
    return true
  }

  async purgeTrash(kind?: 'asset' | 'folder', id?: string) {
    const index = await this.readIndex()
    const folderIds = new Set<string>()
    if (kind === 'folder' && id) {
      folderIds.add(id)
      let changed = true
      while (changed) { changed = false; for (const folder of index.folders) if (folder.deletedAt && folder.originalParentId && folderIds.has(folder.originalParentId) && !folderIds.has(folder.id)) { folderIds.add(folder.id); changed = true } }
    }
    const assets = index.assets.filter((asset) => asset.deletedAt && ((!kind && !id) || (kind === 'asset' && asset.id === id) || (kind === 'folder' && asset.originalFolderId && folderIds.has(asset.originalFolderId))))
    for (const asset of assets) { if (isInside(roots().files, asset.filePath)) await rm(asset.filePath, { force: true }) }
    const assetIds = new Set(assets.map((asset) => asset.id))
    index.assets = index.assets.filter((asset) => !assetIds.has(asset.id))
    if (!kind && !id) index.folders = index.folders.filter((folder) => !folder.deletedAt)
    else if (kind === 'folder') index.folders = index.folders.filter((folder) => !folderIds.has(folder.id))
    await this.writeIndex(index)
    return assets.length
  }

  async audit(repair = false) {
    const index = await this.readIndex()
    const folderIds = new Set(index.folders.map((folder) => folder.id))
    const missingAssetIds: string[] = []
    for (const asset of index.assets) { try { await stat(asset.filePath) } catch { missingAssetIds.push(asset.id) } }
    const orphanAssetIds = index.assets.filter((asset) => asset.folderId && !folderIds.has(asset.folderId)).map((asset) => asset.id)
    const orphanFolderIds = index.folders.filter((folder) => folder.parentId && !folderIds.has(folder.parentId)).map((folder) => folder.id)
    if (repair) {
      const missing = new Set(missingAssetIds)
      index.assets = index.assets.filter((asset) => !missing.has(asset.id))
      index.assets.forEach((asset) => { if (orphanAssetIds.includes(asset.id)) asset.folderId = null })
      index.folders.forEach((folder) => { if (orphanFolderIds.includes(folder.id)) folder.parentId = null })
      await this.writeIndex(index)
    }
    return { missingAssetIds, orphanAssetIds, orphanFolderIds, repaired: repair }
  }

  async exportBackup(destination: string) {
    const target = join(destination, `asset-library-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`)
    await cp(roots().root, target, { recursive: true, errorOnExist: true })
    return target
  }

  async createSession() {
    await this.ensureReceiver()
    const token = randomBytes(24).toString('hex')
    const expiresAt = Date.now() + SESSION_TTL_MS
    this.sessions.set(token, { token, expiresAt, count: 0 })
    this.expireSessions()
    const addresses = Object.values(os.networkInterfaces()).flat().filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    const score = (value: string) => value.startsWith('192.168.') ? 0 : value.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(value) ? 2 : 3
    const address = addresses.sort((a, b) => score(a!.address) - score(b!.address))[0]?.address
    if (!address || !this.port) throw new Error('No active LAN network was found.')
    return { url: `http://${address}:${this.port}/upload/${token}`, expiresAt, ttlMs: SESSION_TTL_MS }
  }

  private expireSessions() {
    for (const [token, session] of this.sessions) if (session.expiresAt <= Date.now()) this.sessions.delete(token)
  }

  private async ensureReceiver() {
    if (this.server && this.port) return
    const server = http.createServer((req, res) => {
      void this.handleMobileRequest(req, res).catch((error) => {
        if (res.headersSent) { res.destroy(); return }
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(String((error as Error)?.message || 'Internal server error'))
      })
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '0.0.0.0', () => { server.removeAllListeners('error'); resolve() })
    })
    this.server = server
    this.port = (server.address() as { port: number }).port
    server.unref()
  }

  private async handleMobileRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const path = String(req.url || '')
    const pageMatch = /^\/upload\/([a-f0-9]{48})$/.exec(path)
    if (req.method === 'GET' && pageMatch) {
      this.expireSessions()
      if (!this.sessions.has(pageMatch[1])) { res.writeHead(410, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Upload link expired. Create a new QR code on your computer.'); return }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(`<!doctype html>
<html lang="zh-CN">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta charset="utf-8">
<meta name="theme-color" content="#07151a">
<title>TiktokCut · 素材库</title>
<style>
:root{color-scheme:dark;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;background:#071116;color:#eef7f5}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#071116}body:before{content:"";position:fixed;inset:0;pointer-events:none;background:linear-gradient(145deg,rgba(22,188,164,.12),transparent 38%),linear-gradient(180deg,#071116,#0b171d 72%,#071116)}
.page{position:relative;width:min(100%,560px);min-height:100vh;margin:auto;padding:28px 20px 34px}.brand{display:flex;align-items:center;gap:11px;margin:2px 0 38px}.brand-mark{position:relative;width:30px;height:30px;border-radius:9px;background:#12bda3;box-shadow:0 8px 22px rgba(18,189,163,.2)}.brand-mark:before,.brand-mark:after{content:"";position:absolute;background:#071116;border-radius:2px;transform:rotate(45deg)}.brand-mark:before{width:11px;height:4px;left:8px;top:9px}.brand-mark:after{width:11px;height:4px;left:8px;top:17px}.brand-name{font-size:15px;font-weight:760;letter-spacing:.01em}.brand-sub{margin-top:3px;color:#7f9a9a;font-size:11px}
.hero{margin-bottom:22px}.eyebrow{display:inline-flex;align-items:center;gap:7px;color:#52d9c1;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}.eyebrow i{display:block;width:6px;height:6px;border-radius:50%;background:#52d9c1;box-shadow:0 0 0 4px rgba(82,217,193,.12)}h1{margin:12px 0 9px;font-size:29px;line-height:1.12;letter-spacing:-.035em} .hero p{margin:0;color:#9db4b1;font-size:14px;line-height:1.65}
.panel{padding:16px;border:1px solid rgba(149,205,195,.15);border-radius:15px;background:rgba(16,35,40,.82);box-shadow:0 18px 55px rgba(0,0,0,.18)}.drop{display:grid;place-items:center;min-height:220px;padding:26px 18px;border:1px dashed rgba(82,217,193,.52);border-radius:11px;background:rgba(19,73,70,.2);text-align:center;transition:background .18s,border-color .18s}.drop-icon{display:grid;place-items:center;width:58px;height:58px;margin-bottom:15px;border:1px solid rgba(82,217,193,.38);border-radius:16px;background:rgba(82,217,193,.12);color:#52d9c1}.drop strong{font-size:16px}.drop span{margin-top:7px;color:#91aaa7;font-size:12px;line-height:1.55}.pick-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;width:100%;max-width:300px;margin-top:17px}.pick-button{display:flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border:1px solid rgba(82,217,193,.28);border-radius:7px;background:rgba(82,217,193,.1);color:#aef3e5;font-size:12px;font-weight:750;cursor:pointer}.pick-button:first-child{border-color:#17b99f;background:#17b99f;color:#06231f}.pick-button:active{transform:translateY(1px)}
input{display:none}.hint{display:flex;justify-content:space-between;gap:10px;margin:13px 2px 0;color:#78918e;font-size:11px}.status{min-height:23px;margin:14px 2px 0;color:#b9d7d1;font-size:12px}.status.ok{color:#62ddbe}.status.error{color:#ff9e9e}.files{display:grid;gap:8px;margin-top:13px}.file{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid rgba(149,205,195,.1);border-radius:9px;background:rgba(4,17,21,.42)}.file-icon{display:grid;place-items:center;flex:0 0 30px;width:30px;height:30px;border-radius:7px;background:rgba(82,217,193,.12);color:#52d9c1;font-size:11px;font-weight:800}.file-copy{min-width:0;flex:1}.file-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.file-state{margin-top:3px;color:#78918e;font-size:10px}.file-state.ok{color:#62ddbe}.file-state.error{color:#ff9e9e}.footer{display:flex;align-items:center;gap:8px;margin-top:20px;color:#66807d;font-size:11px}.lock{width:14px;height:14px;border:1px solid #66807d;border-radius:50%;font-size:9px;text-align:center;line-height:13px}.expiry{margin-left:auto}.footer a{color:#8eaaa6;text-decoration:none}@media(max-width:380px){.page{padding:22px 15px 28px}h1{font-size:26px}.drop{min-height:195px}}
</style></head>
<body><main class="page">
<header class="brand"><div class="brand-mark" aria-hidden="true"></div><div><div class="brand-name">TiktokCut</div><div class="brand-sub">智能视频生产工作台</div></div></header>
<section class="hero"><div class="eyebrow"><i></i> MATERIAL LIBRARY</div><h1>把素材送到电脑</h1><p>选择图片或视频，它们会安全地进入这台电脑的素材库。</p></section>
<section class="panel"><div class="drop"><div class="drop-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg></div><strong>选择图片或视频</strong><span>支持 JPG、PNG、WEBP、MP4、MOV 等格式<br>单个文件最大 100 MB</span><div class="pick-actions"><label class="pick-button" for="fi">选择图片</label><label class="pick-button" for="fv">选择视频</label></div></div><input id="fi" type="file" accept="image/*" multiple><input id="fv" type="file" accept="video/*,.mp4,.mov,.webm,.mkv" multiple><div class="hint"><span>可一次选择多个文件</span><span id="count">等待选择</span></div><div id="files" class="files"></div><p id="s" class="status" role="status">等待上传</p></section>
<footer class="footer"><span class="lock">✓</span><span>仅在当前上传会话内传输</span><span class="expiry">链接即将失效</span></footer>
</main><script>
const token=${JSON.stringify(pageMatch[1])};const imageInput=document.querySelector('#fi');const videoInput=document.querySelector('#fv');const status=document.querySelector('#s');const files=document.querySelector('#files');const count=document.querySelector('#count');
function safeName(value){return String(value||'').replace(/[&<>\"']/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[char]})}
async function uploadSelected(event){const selected=Array.from(event.target.files||[]);if(!selected.length)return;files.innerHTML='';count.textContent=selected.length+' 个文件';let complete=0;status.className='status';status.textContent='正在上传，请保持页面打开';for(const file of selected){const row=document.createElement('div');row.className='file';row.innerHTML='<div class="file-icon">'+(file.type.indexOf('video')===0?'VID':'IMG')+'</div><div class="file-copy"><div class="file-name">'+safeName(file.name)+'</div><div class="file-state">准备上传</div></div>';files.appendChild(row);const state=row.querySelector('.file-state');try{state.textContent='上传中…';const response=await fetch('/upload/'+token,{method:'POST',headers:{'X-File-Name':encodeURIComponent(file.name),'Content-Type':file.type||'application/octet-stream'},body:file});if(!response.ok)throw new Error(await response.text());state.textContent='已加入素材库';state.className='file-state ok';complete++;status.textContent='已完成 '+complete+' / '+selected.length}catch(error){state.textContent='上传失败';state.className='file-state error';status.className='status error';status.textContent=String(error.message||error)}}if(complete===selected.length){status.className='status ok';status.textContent='全部上传完成，可以返回电脑继续使用'}event.target.value=''}
imageInput.addEventListener('change',uploadSelected);videoInput.addEventListener('change',uploadSelected);
</script></body></html>`)
      return
    }
    const uploadMatch = /^\/upload\/([a-f0-9]{48})$/.exec(path)
    if (req.method === 'POST' && uploadMatch) {
      this.expireSessions()
      const session = this.sessions.get(uploadMatch[1])
      if (!session) { res.writeHead(410); res.end('Upload session expired.'); return }
      if (session.count >= MAX_SESSION_UPLOADS) { res.writeHead(429); res.end('Upload session limit reached.'); return }
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += buffer.length
        if (size > MAX_FILE_BYTES) { res.writeHead(413); res.end('File exceeds 100 MB.'); req.resume(); return }
        chunks.push(buffer)
      }
      let name = 'mobile-upload'
      try { name = decodeURIComponent(String(req.headers['x-file-name'] || 'mobile-upload')) } catch { res.writeHead(400); res.end('Invalid filename.'); return }
      const extension = extname(cleanName(name)).toLowerCase()
      if (!ALLOWED_EXTENSIONS.has(extension) || size === 0) { res.writeHead(400); res.end('Unsupported or empty file.'); return }
      const { files } = roots()
      await mkdir(files, { recursive: true })
      const temporary = join(files, `${randomUUID()}${extension}.upload`)
      await writeFile(temporary, Buffer.concat(chunks))
      let imported: LibraryAsset
      try { imported = await this.importFile(temporary, 'mobile', name) }
      finally { await rm(temporary, { force: true }) }
      session.count += 1
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
      res.end(JSON.stringify({ ok: true, count: session.count, name: imported.name }))
      return
    }
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-File-Name' }); res.end(); return }
    res.writeHead(404); res.end('Not found.')
  }

}

export const assetLibraryService = new AssetLibraryService()
