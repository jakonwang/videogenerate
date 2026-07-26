import type { IpcMain } from 'electron'
import { storageManagementService } from '../modules/storage-management/service'

export function registerStorageManagementIpc(ipcMain: IpcMain) {
  ipcMain.handle('storage:getOverview', async () => await storageManagementService.getOverview())
  ipcMain.handle('storage:getCategory', async (_event, payload) => await storageManagementService.getCategory({
    categoryId: payload?.categoryId,
    force: payload?.force,
  }))
  ipcMain.handle('storage:cleanup', async (_event, payload) => await storageManagementService.cleanup({
    categoryId: payload?.categoryId,
    confirmation: payload?.confirmation,
    challenge: payload?.challenge,
  }))
}
