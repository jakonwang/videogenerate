import type { IpcMain } from 'electron'
import { hermesLivePhotoService } from '../modules/live-photo/hermes'

export function registerHermesLivePhotoIpc(ipcMain: IpcMain) {
  ipcMain.handle('hermes:livePhoto:startReferenceSession', async (_e, payload) => await hermesLivePhotoService.startReferenceSession(payload))
  ipcMain.handle('hermes:livePhoto:getLatestSession', async (_e, payload) => await hermesLivePhotoService.getLatestSession(payload))
  ipcMain.handle('hermes:livePhoto:listProductOptions', async () => await hermesLivePhotoService.listProductOptions())
  ipcMain.handle('hermes:livePhoto:selectProduct', async (_e, payload) => await hermesLivePhotoService.selectProduct(payload))
  ipcMain.handle('hermes:livePhoto:selectMaterial', async (_e, payload) => await hermesLivePhotoService.selectMaterial(payload))
  ipcMain.handle('hermes:livePhoto:selectDeliveryCount', async (_e, payload) => await hermesLivePhotoService.selectDeliveryCount(payload))
  ipcMain.handle('hermes:livePhoto:getSessionStatus', async (_e, sessionId: string) => await hermesLivePhotoService.getSessionStatus(sessionId))
}
