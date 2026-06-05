import type { IpcMain } from 'electron'
import { tiktokListingService } from '../modules/tiktok-listing/service'

export function registerTiktokListingIpc(ipcMain: IpcMain) {
  ipcMain.handle('plugin:tiktokListing:list', async () => await tiktokListingService.list())
  ipcMain.handle('plugin:tiktokListing:getExportCategoryConfigs', async () => await tiktokListingService.getExportCategoryConfigs())
  ipcMain.handle('plugin:tiktokListing:saveExportCategoryConfigs', async (_e, payload) => await tiktokListingService.saveExportCategoryConfigs(payload))
  ipcMain.handle('plugin:tiktokListing:createOrUpdate', async (_e, payload) => await tiktokListingService.createOrUpdate(payload))
  ipcMain.handle('plugin:tiktokListing:generate', async (_e, payload: { id: string }) => await tiktokListingService.generate(payload))
  ipcMain.handle('plugin:tiktokListing:remove', async (_e, id: string) => await tiktokListingService.remove(id))
  ipcMain.handle('plugin:tiktokListing:exportExcel', async (_e, payload: { ids: string[] }) => await tiktokListingService.exportExcel(payload))
}
