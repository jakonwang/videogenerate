import type { IpcMain } from 'electron'
import type { CreatorHubSyncStage } from '../../shared/creatorHub'
import { creatorHubService } from '../modules/tiktok-creator-hub/service'

export function registerTiktokCreatorHubIpc(ipcMain: IpcMain) {
  ipcMain.handle('plugin:tiktokCreatorHub:listShops', () => creatorHubService.listShops())
  ipcMain.handle('plugin:tiktokCreatorHub:importCookies', (_e, payload) => creatorHubService.importCookies(payload))
  ipcMain.handle('plugin:tiktokCreatorHub:verifyShop', (_e, id: string) => creatorHubService.verifyShop(id))
  ipcMain.handle('plugin:tiktokCreatorHub:renameShop', (_e, payload: { id: string; name: string }) => creatorHubService.renameShop(payload.id, payload.name))
  ipcMain.handle('plugin:tiktokCreatorHub:removeShop', (_e, id: string) => creatorHubService.removeShop(id))
  ipcMain.handle('plugin:tiktokCreatorHub:openBackend', (_e, payload: { id: string; path?: string }) => creatorHubService.openBackend(payload.id, payload.path))
  ipcMain.handle('plugin:tiktokCreatorHub:syncSamples', (_e, id: string) => creatorHubService.syncSamples(id))
  ipcMain.handle('plugin:tiktokCreatorHub:syncShop', (_e, payload: { id: string; stages?: CreatorHubSyncStage[] }) => creatorHubService.syncShop(payload.id, payload.stages?.length ? payload.stages : undefined))
  ipcMain.handle('plugin:tiktokCreatorHub:listVideos', (_e, shopId?: string) => creatorHubService.listVideos(shopId))
  ipcMain.handle('plugin:tiktokCreatorHub:listOrders', (_e, shopId?: string) => creatorHubService.listOrders(shopId))
  ipcMain.handle('plugin:tiktokCreatorHub:listCrm', (_e, shopId?: string) => creatorHubService.listCrm(shopId))
  ipcMain.handle('plugin:tiktokCreatorHub:saveProfile', (_e, payload) => creatorHubService.saveProfile(payload))
  ipcMain.handle('plugin:tiktokCreatorHub:getOverview', (_e, shopId?: string) => creatorHubService.getOverview(shopId))
  ipcMain.handle('plugin:tiktokCreatorHub:getSyncProgress', (_e, id: string) => creatorHubService.getSyncProgress(id))
  ipcMain.handle('plugin:tiktokCreatorHub:listSyncJobs', (_e, id: string) => creatorHubService.listSyncJobs(id))
  ipcMain.handle('plugin:tiktokCreatorHub:listSamples', (_e, shopId?: string) => creatorHubService.listSamples(shopId))
  ipcMain.handle('plugin:tiktokCreatorHub:updateSample', (_e, payload) => creatorHubService.updateSample(payload))
  ipcMain.handle('plugin:tiktokCreatorHub:listCosts', (_e, shopId?: string) => creatorHubService.listCosts(shopId))
  ipcMain.handle('plugin:tiktokCreatorHub:saveCost', (_e, payload) => creatorHubService.saveCost(payload))
  ipcMain.handle('plugin:tiktokCreatorHub:removeCost', (_e, id: string) => creatorHubService.removeCost(id))
  ipcMain.handle('plugin:tiktokCreatorHub:getSettings', () => creatorHubService.getSettings())
  ipcMain.handle('plugin:tiktokCreatorHub:saveSettings', (_e, payload) => creatorHubService.saveSettings(payload))
  ipcMain.handle('plugin:tiktokCreatorHub:getFulfillment', (_e, shopId?: string) => creatorHubService.getFulfillment(shopId))
}
