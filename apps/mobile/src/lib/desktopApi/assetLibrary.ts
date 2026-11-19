/**
 * 网页版的素材库接口：电脑端「素材库」页面（AssetLibraryView）在网页上原样显示，
 * 它调用的 window.api.assetLibrary 由这里提供——数据是云端素材（assets，手机 App 同一份）。
 *
 * - 文件夹：素材的 folder 用「 / 」分隔层级，文件夹 id 就是这个路径；空文件夹和回收站里的文件夹另存在 asset-folders。
 * - 只显示图片和视频（和电脑端一样）；网页 / 手机上传的音乐仍在云端，模板里照常能用。
 * - 回收站：素材打 trashedAt；删除文件夹时文件夹记录和里面的素材用同一个 trashedAt，恢复时一起恢复。
 * - 编辑原图（裁剪 / 改尺寸 / 去水印模糊）在浏览器里用 canvas 做，结果替换这条素材的文件。
 * - 数据检查、备份导出、手机扫码上传是电脑本地的功能，网页上给出说明。
 */
import { cloudFileRef } from '@shared/cloud/relay'
import { SYNC_COLLECTIONS, type SyncAsset, type SyncAssetFolder } from '@shared/cloud/sync'
import type { AssetFolder, AssetImageEditInput, AssetLibraryAudit, AssetLibraryTrash, LibraryAsset } from '@shared/assetLibrary'
import { ASSET_FOLDER_MAX, uploadAsset } from '../assets'
import { fileBlob, uploadRaw } from '../files'
import { fileLink } from '../fileLinks'
import { errorMessage } from '../session'
import { deleteRecord, listRecords, newId, saveRecord } from '../sync'
import { toast } from '../toast'
import type { DesktopApi } from './contract'
import { chooseFiles, droppedFile, getPathForFile } from './files'

type Asset = SyncAsset & { id: string; updatedAt: number }
type FolderRow = SyncAssetFolder & { id: string; updatedAt: number }

/* ------------------------------------------------------------------ 路径 */

const SEP = ' / '
const parts = (path?: string | null) => String(path || '').split('/').map((part) => part.trim()).filter(Boolean)
const norm = (path?: string | null) => parts(path).join(SEP)
const join = (parent: string | null | undefined, name: string) => norm([...parts(parent), name.replace(/\//g, '／').trim()].join('/'))
const parentOf = (path: string) => (parts(path).length > 1 ? parts(path).slice(0, -1).join(SEP) : null)
const inside = (path: string | undefined, root: string) => {
  const p = norm(path)
  return p === root || p.startsWith(root + SEP)
}

/* ------------------------------------------------------------------ 读取 */

async function readAll() {
  const [assetRecords, folderRecords] = await Promise.all([listRecords<SyncAsset>(SYNC_COLLECTIONS.assets), listRecords<SyncAssetFolder>(SYNC_COLLECTIONS.assetFolders)])
  const assets = assetRecords
    .filter((record) => record.data && (record.data.kind === 'image' || record.data.kind === 'video'))
    .map((record) => ({ ...(record.data as SyncAsset), id: record.id, updatedAt: record.updatedAt }))
  const folders = folderRecords.filter((record) => record.data).map((record) => ({ ...(record.data as SyncAssetFolder), id: record.id, path: norm(record.data!.path), updatedAt: record.updatedAt }))
  const trashedFolders = folders.filter((folder) => folder.trashedAt)
  const underTrashedFolder = (path?: string) => trashedFolders.find((folder) => inside(path, folder.path))
  return { assets, folders, trashedFolders, underTrashedFolder }
}

const extOf = (asset: SyncAsset) => (asset.mime.split('/')[1] || (asset.kind === 'video' ? 'mp4' : 'jpg')).replace('jpeg', 'jpg').replace('quicktime', 'mov')

function toLibraryAsset(asset: Asset): LibraryAsset {
  const fileName = `${asset.name}.${extOf(asset)}`
  return {
    id: asset.id,
    name: asset.name,
    fileName,
    filePath: cloudFileRef(asset.fileId, fileName),
    type: asset.kind === 'video' ? 'video' : 'image',
    mimeType: asset.mime,
    size: asset.size,
    source: 'desktop',
    createdAt: asset.createdAt,
    folderId: norm(asset.folder) || null,
    deletedAt: asset.trashedAt,
    originalFolderId: asset.trashedAt ? norm(asset.folder) || null : undefined,
  }
}

function toFolder(path: string, row?: FolderRow): AssetFolder {
  return { id: path, name: parts(path).pop() || path, parentId: parentOf(path), createdAt: row?.createdAt ?? 0, updatedAt: row?.updatedAt ?? 0, deletedAt: row?.trashedAt, originalParentId: row?.trashedAt ? parentOf(path) : undefined }
}

/** 所有在用的文件夹：素材所在的文件夹（含上层）+ 单独建的文件夹；回收站里的文件夹及其下层不算 */
function liveFolders(data: Awaited<ReturnType<typeof readAll>>) {
  const rows = new Map(data.folders.filter((folder) => !folder.trashedAt).map((folder) => [folder.path, folder]))
  const paths = new Set<string>()
  const add = (path: string) => {
    const segs = parts(path)
    for (let i = 1; i <= segs.length; i += 1) paths.add(segs.slice(0, i).join(SEP))
  }
  data.assets.filter((asset) => !asset.trashedAt && asset.folder).forEach((asset) => add(norm(asset.folder)))
  rows.forEach((_row, path) => add(path))
  return [...paths].filter((path) => !data.underTrashedFolder(path)).map((path) => toFolder(path, rows.get(path)))
}

async function list(payload?: { query?: string; type?: 'all' | 'image' | 'video'; folderId?: string | null }) {
  const data = await readAll()
  const query = String(payload?.query || '').trim().toLowerCase()
  return data.assets
    .filter((asset) => !asset.trashedAt && !data.underTrashedFolder(asset.folder))
    .filter((asset) => !payload?.type || payload.type === 'all' || asset.kind === payload.type)
    .filter((asset) => payload?.folderId === undefined || (norm(asset.folder) || null) === (payload.folderId || null))
    .filter((asset) => !query || asset.name.toLowerCase().includes(query))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(toLibraryAsset)
}

async function listAllFolders() {
  return liveFolders(await readAll())
}

async function listFolders(parentId?: string | null) {
  return (await listAllFolders()).filter((folder) => folder.parentId === (parentId || null))
}

/* ------------------------------------------------------------------ 写入 */

async function saveAsset(asset: Asset, patch: Partial<SyncAsset>) {
  const { id, updatedAt: _u, ...data } = asset
  const next: SyncAsset = { ...data, ...patch }
  next.folder = norm(next.folder).slice(0, ASSET_FOLDER_MAX) || undefined
  if (!next.trashedAt) delete next.trashedAt
  await saveRecord<SyncAsset>(SYNC_COLLECTIONS.assets, id, next)
}

async function saveFolder(row: FolderRow | null, data: SyncAssetFolder) {
  const next: SyncAssetFolder = { path: norm(data.path).slice(0, ASSET_FOLDER_MAX), createdAt: data.createdAt }
  if (data.trashedAt) next.trashedAt = data.trashedAt
  await saveRecord<SyncAssetFolder>(SYNC_COLLECTIONS.assetFolders, row?.id ?? newId('afd'), next)
}

const byIds = async (ids: string[]) => {
  const wanted = new Set(ids)
  return (await readAll()).assets.filter((asset) => wanted.has(asset.id))
}

async function uploadFiles(files: File[], folderId?: string | null) {
  const media = files.filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'))
  if (!media.length) throw new Error('未识别到可导入的图片或视频文件。')
  toast(`正在上传 ${media.length} 个文件…`)
  const done: LibraryAsset[] = []
  for (const file of media) {
    try {
      const item = await uploadAsset(file, folderId || '')
      done.push(toLibraryAsset({ ...item, updatedAt: Date.now() }))
    } catch (error) {
      toast(`「${file.name}」上传失败：${errorMessage(error)}`)
    }
  }
  return done
}

async function createFolder(payload: { name: string; parentId?: string | null }) {
  const name = String(payload.name || '').trim()
  if (!name) throw new Error('请输入文件夹名称')
  const path = join(payload.parentId, name)
  if ((await listAllFolders()).some((folder) => folder.id === path)) throw new Error(`已有同名文件夹“${name}”`)
  await saveFolder(null, { path, createdAt: Date.now() })
  return toFolder(path)
}

/** 改名 / 移动文件夹：这个文件夹及下层的素材和文件夹记录都换成新路径 */
async function repath(from: string, to: string) {
  if (from === to) return
  if (inside(to, from)) throw new Error('不能把文件夹移到它自己里面')
  if ((await listAllFolders()).some((folder) => folder.id === to)) throw new Error('目标位置已有同名文件夹')
  const data = await readAll()
  const swap = (path?: string) => to + norm(path).slice(from.length)
  for (const asset of data.assets.filter((item) => inside(item.folder, from))) await saveAsset(asset, { folder: swap(asset.folder) })
  for (const row of data.folders.filter((item) => inside(item.path, from))) await saveFolder(row, { ...row, path: swap(row.path) })
  if (!data.folders.some((row) => row.path === from)) await saveFolder(null, { path: to, createdAt: Date.now() })
}

async function renameFolder(payload: { id: string; name: string }) {
  const to = join(parentOf(payload.id), String(payload.name || '').trim())
  await repath(payload.id, to)
  return toFolder(to)
}

async function moveFolder(payload: { id: string; parentId?: string | null }) {
  const to = join(payload.parentId, parts(payload.id).pop() || payload.id)
  await repath(payload.id, to)
  return toFolder(to)
}

async function folderStats(id: string) {
  const data = await readAll()
  const assets = data.assets.filter((asset) => !asset.trashedAt && inside(asset.folder, id))
  return { folderCount: liveFolders(data).filter((folder) => inside(folder.id, id)).length, assetCount: assets.length, totalSize: assets.reduce((sum, asset) => sum + (asset.size || 0), 0) }
}

async function moveAssets(payload: { ids: string[]; folderId?: string | null }) {
  for (const asset of await byIds(payload.ids)) await saveAsset(asset, { folder: payload.folderId || '' })
  return { ok: true }
}

async function copyAssets(payload: { ids: string[]; folderId?: string | null }) {
  for (const asset of await byIds(payload.ids)) {
    const { id: _id, updatedAt: _u, trashedAt: _t, ...data } = asset
    await saveRecord<SyncAsset>(SYNC_COLLECTIONS.assets, newId('asset'), { ...data, folder: norm(payload.folderId) || undefined, createdAt: Date.now() })
  }
  return { ok: true }
}

async function renameAsset(payload: { id: string; name: string }) {
  const [asset] = await byIds([payload.id])
  if (!asset) throw new Error('素材不存在，请刷新后重试')
  const name = String(payload.name || '').trim().slice(0, 80)
  if (!name) throw new Error('请输入名称')
  await saveAsset(asset, { name })
  return toLibraryAsset({ ...asset, name })
}

async function trashAssets(ids: string[]) {
  const at = Date.now()
  for (const asset of await byIds(ids)) await saveAsset(asset, { trashedAt: at })
  return { ok: true }
}

async function trashFolder(id: string) {
  const at = Date.now()
  const data = await readAll()
  for (const asset of data.assets.filter((item) => !item.trashedAt && inside(item.folder, id))) await saveAsset(asset, { trashedAt: at })
  const row = data.folders.find((item) => item.path === id) ?? null
  await saveFolder(row, { path: id, createdAt: row?.createdAt ?? Date.now(), trashedAt: at })
  return { ok: true }
}

async function listTrash(): Promise<AssetLibraryTrash> {
  const data = await readAll()
  // 跟着文件夹一起删的素材在文件夹里恢复，回收站只列文件夹本身
  const withFolder = (asset: Asset) => data.trashedFolders.some((folder) => folder.trashedAt === asset.trashedAt && inside(asset.folder, folder.path))
  return {
    assets: data.assets.filter((asset) => asset.trashedAt && !withFolder(asset)).map(toLibraryAsset),
    folders: data.trashedFolders.map((folder) => toFolder(folder.path, folder)),
  }
}

async function restoreTrash(payload: { kind: 'asset' | 'folder'; id: string }) {
  const data = await readAll()
  if (payload.kind === 'asset') {
    const asset = data.assets.find((item) => item.id === payload.id)
    // 原文件夹还在回收站：放回根目录
    if (asset) await saveAsset(asset, { trashedAt: undefined, folder: data.underTrashedFolder(asset.folder) ? '' : asset.folder })
    return { ok: true }
  }
  const folder = data.trashedFolders.find((item) => item.path === payload.id)
  if (!folder) return { ok: true }
  for (const asset of data.assets.filter((item) => item.trashedAt === folder.trashedAt && inside(item.folder, folder.path))) await saveAsset(asset, { trashedAt: undefined })
  await saveFolder(folder, { path: folder.path, createdAt: folder.createdAt })
  return { ok: true }
}

/** 彻底删除：只删记录；文件没有别处引用时由服务器定期清理 */
async function purgeTrash(payload?: { kind?: 'asset' | 'folder'; id?: string }) {
  const data = await readAll()
  const purgeFolder = async (folder: FolderRow) => {
    for (const asset of data.assets.filter((item) => item.trashedAt === folder.trashedAt && inside(item.folder, folder.path))) await deleteRecord(SYNC_COLLECTIONS.assets, asset.id)
    for (const row of data.folders.filter((item) => inside(item.path, folder.path))) await deleteRecord(SYNC_COLLECTIONS.assetFolders, row.id)
  }
  if (payload?.kind === 'asset' && payload.id) await deleteRecord(SYNC_COLLECTIONS.assets, payload.id)
  else if (payload?.kind === 'folder' && payload.id) {
    const folder = data.trashedFolders.find((item) => item.path === payload.id)
    if (folder) await purgeFolder(folder)
  } else {
    for (const asset of data.assets.filter((item) => item.trashedAt)) await deleteRecord(SYNC_COLLECTIONS.assets, asset.id)
    for (const folder of data.trashedFolders) await purgeFolder(folder)
  }
  return { ok: true }
}

async function removeMany(ids: string[]) {
  for (const id of ids) await deleteRecord(SYNC_COLLECTIONS.assets, id)
  return { ok: true }
}

async function thumbnail(id: string) {
  const [asset] = await byIds([id])
  const fileId = asset?.kind === 'image' ? asset.fileId : asset?.posterFileId
  if (!fileId) throw new Error('没有封面')
  return fileLink(fileId)
}

/* ------------------------------------------------------------------ 编辑原图（canvas） */

async function editImage(payload: { id: string; input: AssetImageEditInput }) {
  const [asset] = await byIds([payload.id])
  if (!asset || asset.kind !== 'image') throw new Error('只能编辑图片')
  const source = await createImageBitmap(await fileBlob(asset.fileId))
  try {
    const { crop, resize, removeWatermark } = payload.input
    // 去水印：把这块区域模糊后盖回原图
    const base = document.createElement('canvas')
    base.width = source.width
    base.height = source.height
    const ctx = base.getContext('2d')!
    ctx.drawImage(source, 0, 0)
    if (removeWatermark) {
      const r = removeWatermark
      ctx.save()
      ctx.beginPath()
      ctx.rect(r.left, r.top, r.width, r.height)
      ctx.clip()
      ctx.filter = `blur(${Math.max(1, Math.min(100, Number(r.blur || 18)))}px)`
      ctx.drawImage(source, 0, 0)
      ctx.restore()
    }
    const area = crop ?? { left: 0, top: 0, width: source.width, height: source.height }
    const out = document.createElement('canvas')
    let dx = 0
    let dy = 0
    let dw = area.width
    let dh = area.height
    if (resize) {
      out.width = resize.width
      out.height = resize.height
      const fit = resize.fit || 'contain'
      if (fit !== 'fill') {
        const scale = fit === 'cover' ? Math.max(resize.width / area.width, resize.height / area.height) : Math.min(resize.width / area.width, resize.height / area.height)
        dw = area.width * scale
        dh = area.height * scale
        dx = (resize.width - dw) / 2
        dy = (resize.height - dh) / 2
      } else {
        dw = resize.width
        dh = resize.height
      }
    } else {
      out.width = area.width
      out.height = area.height
    }
    const octx = out.getContext('2d')!
    octx.fillStyle = '#ffffff'
    octx.fillRect(0, 0, out.width, out.height)
    octx.drawImage(base, area.left, area.top, area.width, area.height, dx, dy, dw, dh)
    const mime = asset.mime === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob>((resolve, reject) => out.toBlob((value) => (value ? resolve(value) : reject(new Error('图片处理失败'))), mime, 0.92))
    const uploaded = await uploadRaw(blob, mime)
    await saveAsset(asset, { fileId: uploaded.fileId, mime, size: blob.size, width: out.width, height: out.height })
    return toLibraryAsset({ ...asset, fileId: uploaded.fileId, mime, size: blob.size })
  } finally {
    source.close()
  }
}

/* ------------------------------------------------------------------ 电脑本地才有的功能 */

async function audit(_repair?: boolean): Promise<AssetLibraryAudit> {
  // 网页版的素材都在云端，没有本地文件会丢失
  return { missingAssetIds: [], orphanAssetIds: [], orphanFolderIds: [], repaired: false }
}

const assetLibrary = {
  list,
  upload: async (folderId?: string | null) => uploadFiles(await chooseFiles('image/*,video/*', true), folderId),
  importPaths: async (payload: { paths: string[]; folderId?: string | null }) =>
    uploadFiles(payload.paths.map((path) => droppedFile(path)).filter((file): file is File => Boolean(file)), payload.folderId),
  listFolders,
  listAllFolders,
  getFolderPath: async (folderId?: string | null) => parts(folderId).map((_name, index, all) => toFolder(all.slice(0, index + 1).join(SEP))),
  createFolder,
  renameFolder,
  removeFolder: (id: string) => trashFolder(id),
  moveAssets,
  copyAssets,
  renameAsset,
  removeMany,
  moveFolder,
  folderStats,
  trashAssets,
  trashFolder,
  listTrash,
  restoreTrash,
  purgeTrash,
  audit,
  exportBackup: async (): Promise<string | null> => {
    throw new Error('网页版的素材都存在云端，不需要导出备份；要留一份可以选中素材后逐个下载。')
  },
  remove: async (id: string) => removeMany([id]),
  updateUsageStatus: async (_payload: { id: string; pluginId: string; usageStatus: 'used' | 'unused' }) => ({ ok: true }),
  thumbnail,
  editImage,
  createUploadSession: async (): Promise<{ url: string; expiresAt: number }> => {
    throw new Error('网页版不需要扫码上传：在手机 App 的素材库里上传，会自动同步到这里。')
  },
} satisfies DesktopApi['assetLibrary']

/** 这个页面打开期间替换的 window.api 部分 */
export default {
  assetLibrary,
  getPathForFile,
}
