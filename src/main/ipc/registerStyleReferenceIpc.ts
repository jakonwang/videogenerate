import type { IpcMain } from 'electron'
import { styleReferenceService } from '../modules/style-reference/service'

/** 同款模板: analyse a reference clip once, then tk创意室 / 图生视频 batch-copy it. */
export function registerStyleReferenceIpc(ipcMain: IpcMain) {
  ipcMain.handle('plugin:styleReference:analyze', async (_e, payload: { videoPath: string }) => await styleReferenceService.analyze(payload))
  ipcMain.handle('plugin:styleReference:list', async () => await styleReferenceService.list())
}
