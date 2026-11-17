import type { BrowserWindow, IpcMain } from 'electron'
import { videoWatermarkService } from '../modules/video-watermark/service'

export function registerVideoWatermarkIpc(ipcMain: IpcMain, getWindow: () => BrowserWindow | null) {
  ipcMain.handle('videoWatermark:getState', async () => await videoWatermarkService.getState())
  ipcMain.handle('videoWatermark:start', async (_event, payload) => await videoWatermarkService.start(payload))
  ipcMain.handle('videoWatermark:retryFailed', async (_event, batchId: string) => await videoWatermarkService.retryFailed(batchId))
  ipcMain.handle('videoWatermark:removeBatch', async (_event, batchId: string) => await videoWatermarkService.removeBatch(batchId))
  ipcMain.handle('videoWatermark:preview', async (_event, settings) => await videoWatermarkService.preview(settings))
  return videoWatermarkService.subscribe((batch) => {
    const window = getWindow()
    if (!window || window.isDestroyed()) return
    window.webContents.send('videoWatermark:changed', batch)
  })
}
