import type { BrowserWindow, IpcMain } from 'electron'
import { configureDianxiaomiInventoryService, dianxiaomiInventoryService } from '../modules/dianxiaomi-inventory/service'

export function registerDianxiaomiInventoryIpc(ipcMain: IpcMain, getMainWindow: () => BrowserWindow | null) {
  configureDianxiaomiInventoryService(getMainWindow)
  ipcMain.handle('plugin:dianxiaomiInventory:getDashboard', async () => await dianxiaomiInventoryService.getDashboard())
  ipcMain.handle('plugin:dianxiaomiInventory:getDetail', async (_event, payload) => await dianxiaomiInventoryService.getDetail(payload))
  ipcMain.handle('plugin:dianxiaomiInventory:saveSku', async (_event, payload) => await dianxiaomiInventoryService.saveSku(payload))
  ipcMain.handle('plugin:dianxiaomiInventory:removeSku', async (_event, id: string) => await dianxiaomiInventoryService.removeSku(id))
  ipcMain.handle('plugin:dianxiaomiInventory:sync', async (_event, payload) => await dianxiaomiInventoryService.sync(payload))
  ipcMain.handle('plugin:dianxiaomiInventory:getAuthStatus', async () => await dianxiaomiInventoryService.getAuthStatus())
  ipcMain.handle('plugin:dianxiaomiInventory:openLogin', async () => await dianxiaomiInventoryService.openLogin())
  ipcMain.handle('plugin:dianxiaomiInventory:logout', async () => await dianxiaomiInventoryService.logout())
}
