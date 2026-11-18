import type { IpcMain } from 'electron'
import { dialog } from 'electron'
import { assetLibraryService } from '../modules/asset-library/service'
import { cloneService } from '../modules/clone/service'

export function registerAssetLibraryIpc(ipcMain: IpcMain) {
  ipcMain.handle('assetLibrary:list', async (_event, payload?: { query?: string; type?: 'all' | 'image' | 'video'; folderId?: string | null }) =>
    assetLibraryService.list(String(payload?.query || ''), payload?.type || 'all', payload && 'folderId' in payload ? payload.folderId || null : undefined),
  )
  ipcMain.handle('assetLibrary:upload', async (_event, folderId?: string | null) => {
    assetLibraryService.setQiniuCredentials(await cloneService.getModelCredentials())
    const picked = await dialog.showOpenDialog({
      title: 'Upload assets to library',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images and videos', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov', 'webm', 'mkv'] },
        { name: 'Videos', extensions: ['mp4', 'mov', 'webm', 'mkv'] },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] },
      ],
    })
    if (picked.canceled) return []
    const results = []
    for (const path of picked.filePaths) results.push(await assetLibraryService.importFile(path, 'desktop', undefined, folderId || null))
    return results
  })
  ipcMain.handle('assetLibrary:importPaths', async (_event, payload: { paths?: string[]; folderId?: string | null }) => {
    assetLibraryService.setQiniuCredentials(await cloneService.getModelCredentials())
    const results = []
    for (const path of payload?.paths || []) results.push(await assetLibraryService.importFile(String(path), 'desktop', undefined, payload?.folderId || null))
    return results
  })
  ipcMain.handle('assetLibrary:listFolders', async (_event, parentId?: string | null) => assetLibraryService.listFolders(parentId || null))
  ipcMain.handle('assetLibrary:listAllFolders', async () => assetLibraryService.listAllFolders())
  ipcMain.handle('assetLibrary:getFolderPath', async (_event, folderId?: string | null) => assetLibraryService.getFolderPath(folderId || null))
  ipcMain.handle('assetLibrary:createFolder', async (_event, payload: { name?: string; parentId?: string | null }) => assetLibraryService.createFolder(String(payload?.name || ''), payload?.parentId || null))
  ipcMain.handle('assetLibrary:renameFolder', async (_event, payload: { id?: string; name?: string }) => assetLibraryService.renameFolder(String(payload?.id || ''), String(payload?.name || '')))
  ipcMain.handle('assetLibrary:removeFolder', async (_event, id?: string) => assetLibraryService.removeFolder(String(id || '')))
  ipcMain.handle('assetLibrary:moveAssets', async (_event, payload: { ids?: string[]; folderId?: string | null }) => assetLibraryService.moveAssets(payload?.ids || [], payload?.folderId || null))
  ipcMain.handle('assetLibrary:copyAssets', async (_event, payload: { ids?: string[]; folderId?: string | null }) => assetLibraryService.copyAssets(payload?.ids || [], payload?.folderId || null))
  ipcMain.handle('assetLibrary:renameAsset', async (_event, payload: { id?: string; name?: string }) => assetLibraryService.renameAsset(String(payload?.id || ''), String(payload?.name || '')))
  ipcMain.handle('assetLibrary:removeMany', async (_event, ids?: string[]) => assetLibraryService.removeMany(ids || []))
  ipcMain.handle('assetLibrary:moveFolder', async (_event, payload: { id?: string; parentId?: string | null }) => assetLibraryService.moveFolder(String(payload?.id || ''), payload?.parentId || null))
  ipcMain.handle('assetLibrary:folderStats', async (_event, id?: string) => assetLibraryService.folderStats(String(id || '')))
  ipcMain.handle('assetLibrary:trashAssets', async (_event, ids?: string[]) => assetLibraryService.trashAssets(ids || []))
  ipcMain.handle('assetLibrary:trashFolder', async (_event, id?: string) => assetLibraryService.trashFolder(String(id || '')))
  ipcMain.handle('assetLibrary:listTrash', async () => assetLibraryService.listTrash())
  ipcMain.handle('assetLibrary:restoreTrash', async (_event, payload: { kind?: 'asset' | 'folder'; id?: string }) => assetLibraryService.restoreTrash(payload?.kind || 'asset', String(payload?.id || '')))
  ipcMain.handle('assetLibrary:purgeTrash', async (_event, payload?: { kind?: 'asset' | 'folder'; id?: string }) => assetLibraryService.purgeTrash(payload?.kind, payload?.id))
  ipcMain.handle('assetLibrary:audit', async (_event, repair?: boolean) => assetLibraryService.audit(Boolean(repair)))
  ipcMain.handle('assetLibrary:exportBackup', async () => {
    const picked = await dialog.showOpenDialog({ title: 'Export asset library backup', properties: ['openDirectory', 'createDirectory'] })
    if (picked.canceled || !picked.filePaths[0]) return null
    return assetLibraryService.exportBackup(picked.filePaths[0])
  })
  ipcMain.handle('assetLibrary:remove', async (_event, id: string) => assetLibraryService.remove(String(id || '')))
  ipcMain.handle('assetLibrary:updateUsageStatus', async (_event, payload: { id?: string; pluginId?: string; usageStatus?: 'used' | 'unused' }) => {
    if (payload?.usageStatus !== 'used' && payload?.usageStatus !== 'unused') throw new Error('Invalid usage status.')
    return assetLibraryService.updateUsageStatus(String(payload?.id || ''), String(payload?.pluginId || ''), payload.usageStatus)
  })
  ipcMain.handle('assetLibrary:thumbnail', async (_event, id: string) => assetLibraryService.thumbnail(String(id || '')))
  ipcMain.handle('assetLibrary:editImage', async (_event, payload: { id: string; input: import('../../shared/assetLibrary').AssetImageEditInput }) => {
    assetLibraryService.setQiniuCredentials(await cloneService.getModelCredentials())
    return assetLibraryService.editImage(String(payload?.id || ''), payload?.input || {})
  })
  ipcMain.handle('assetLibrary:createUploadSession', async () => {
    assetLibraryService.setQiniuCredentials(await cloneService.getModelCredentials())
    return assetLibraryService.createSession()
  })
}
