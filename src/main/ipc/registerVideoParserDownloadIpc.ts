import type { IpcMain } from 'electron'
import { videoParserDownloadService } from '../modules/video-parser-download/service'

export function registerVideoParserDownloadIpc(ipcMain: IpcMain) {
  ipcMain.handle('plugin:videoParserDownload:listItems', async (_e, payload: { userId: string }) =>
    await videoParserDownloadService.listItems(payload.userId),
  )
  ipcMain.handle('plugin:videoParserDownload:importShareUrls', async (_e, payload: { userId: string; shareUrls: string[] }) =>
    await videoParserDownloadService.importShareUrls(payload),
  )
  ipcMain.handle('plugin:videoParserDownload:retryItem', async (_e, payload: { userId: string; id: string }) =>
    await videoParserDownloadService.retryItem(payload),
  )
  ipcMain.handle('plugin:videoParserDownload:deleteItem', async (_e, payload: { userId: string; id: string }) =>
    await videoParserDownloadService.deleteItem(payload),
  )
}
