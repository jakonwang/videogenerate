import type { IpcMain } from 'electron'
import { getCloudSyncStatus, runCloudSync } from '../modules/cloud-sync/service'

/** 多端同步（商品库、模特库 ↔ 云端 ↔ 手机 App） */
export function registerCloudSyncIpc(ipcMain: IpcMain) {
  ipcMain.handle('cloudSync:status', async () => getCloudSyncStatus())
  ipcMain.handle('cloudSync:run', async () => runCloudSync())
}
