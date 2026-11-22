import type { IpcMain } from 'electron'
import { sellerInventoryService } from '../modules/seller-inventory/service'

export function registerSellerInventoryIpc(ipcMain: IpcMain) {
  // Daily morning report (desktop notification + Feishu), see sellerInventoryService.runScheduledReport.
  sellerInventoryService.startScheduler()
  ipcMain.handle('plugin:sellerInventory:listShops', async () => sellerInventoryService.listShops())
  ipcMain.handle('plugin:sellerInventory:getDashboard', async (_event, payload) => sellerInventoryService.getDashboard(payload))
  ipcMain.handle('plugin:sellerInventory:getShopsOverview', async () => sellerInventoryService.getShopsOverview())
  ipcMain.handle('plugin:sellerInventory:getShopReport', async (_event, payload) => sellerInventoryService.getShopReport(payload))
  ipcMain.handle('plugin:sellerInventory:generateReport', async () => await sellerInventoryService.generateReport())
  ipcMain.handle('plugin:sellerInventory:listReports', async () => sellerInventoryService.listReports())
  ipcMain.handle('plugin:sellerInventory:getReportSettings', async () => sellerInventoryService.getReportSettings())
  ipcMain.handle('plugin:sellerInventory:saveReportSettings', async (_event, payload) => sellerInventoryService.saveReportSettings(payload))
  ipcMain.handle('plugin:sellerInventory:getShopProfit', async (_event, payload) => sellerInventoryService.getShopProfit(payload))
  ipcMain.handle('plugin:sellerInventory:setAdLink', async (_event, payload) => sellerInventoryService.setAdLink(payload))
  ipcMain.handle('plugin:sellerInventory:dataVersion', async () => sellerInventoryService.dataVersion())
  ipcMain.handle('plugin:sellerInventory:getProgress', async () => sellerInventoryService.getProgress())
  // Sync runs in the background; the page polls getProgress / getDashboard.
  ipcMain.handle('plugin:sellerInventory:sync', async (_event, payload) => {
    if (sellerInventoryService.isSyncing()) return { started: false, reason: 'running' as const }
    void sellerInventoryService.sync(payload).catch((error) => console.warn('[seller-inventory] sync error', error))
    return { started: true as const }
  })
  ipcMain.handle('plugin:sellerInventory:openSellerCenter', async (_event, shopKey: string, path?: string) => await sellerInventoryService.openSellerCenter(shopKey, path))
  ipcMain.handle('plugin:sellerInventory:listMappings', async () => sellerInventoryService.listMappings())
  ipcMain.handle('plugin:sellerInventory:setMapping', async (_event, payload) => sellerInventoryService.setMapping(payload))
  ipcMain.handle('plugin:sellerInventory:applySuggestions', async () => sellerInventoryService.applySuggestions())
  ipcMain.handle('plugin:sellerInventory:saveSkuSettings', async (_event, payload) => sellerInventoryService.saveSkuSettings(payload))
  ipcMain.handle('plugin:sellerInventory:listMoves', async (_event, payload) => sellerInventoryService.listMoves(payload))
  ipcMain.handle('plugin:sellerInventory:addMove', async (_event, payload) => sellerInventoryService.addMove(payload))
  ipcMain.handle('plugin:sellerInventory:removeMove', async (_event, id: string) => sellerInventoryService.removeMove(id))
  ipcMain.handle('plugin:sellerInventory:getSettings', async () => sellerInventoryService.getSettings())
  ipcMain.handle('plugin:sellerInventory:saveSettings', async (_event, payload) => sellerInventoryService.saveSettings(payload))
}
