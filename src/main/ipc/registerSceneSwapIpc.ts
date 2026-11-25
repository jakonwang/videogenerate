import { dialog, type IpcMain } from 'electron'
import { sceneSwapService } from '../modules/scene-swap/service'

/** AI 修图 · 批量换景：批次在云端跑，本机负责选图、上传、缓存显示和导出 */
export function registerSceneSwapIpc(ipcMain: IpcMain) {
  ipcMain.handle('sceneSwap:pick', async (_event, kind: 'files' | 'folder') => {
    const result = await dialog.showOpenDialog(
      kind === 'folder' ? { properties: ['openDirectory'] } : { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] },
    )
    return result.canceled ? [] : sceneSwapService.expandPaths(result.filePaths)
  })
  ipcMain.handle('sceneSwap:expandPaths', (_event, paths: string[]) => sceneSwapService.expandPaths(paths))
  ipcMain.handle('sceneSwap:upload', (_event, path: string) => sceneSwapService.upload(path))
  ipcMain.handle('sceneSwap:imagePath', (_event, fileId: string) => sceneSwapService.imagePath(fileId))
  ipcMain.handle('sceneSwap:info', () => sceneSwapService.client().info())
  ipcMain.handle('sceneSwap:list', () => sceneSwapService.client().list())
  ipcMain.handle('sceneSwap:create', (_event, input) => sceneSwapService.client().create(input))
  ipcMain.handle('sceneSwap:remove', (_event, id: string) => sceneSwapService.client().remove(id))
  ipcMain.handle('sceneSwap:action', (_event, id: string, action) => sceneSwapService.client().action(id, action))
  ipcMain.handle('sceneSwap:item', (_event, id: string, itemId: string, action, reasons?: string[]) => sceneSwapService.client().item(id, itemId, action, reasons))
  ipcMain.handle('sceneSwap:addScene', (_event, input: { fileId: string; name: string }) => sceneSwapService.client().addScene(input))
  ipcMain.handle('sceneSwap:removeScene', (_event, id: string) => sceneSwapService.client().removeScene(id))
  ipcMain.handle('sceneSwap:addModel', (_event, input: { fileId: string; name: string }) => sceneSwapService.client().addModel(input))
  ipcMain.handle('sceneSwap:removeModel', (_event, id: string) => sceneSwapService.client().removeModel(id))
  ipcMain.handle('sceneSwap:exportResults', async (_event, files: Array<{ fileId: string; name: string }>) => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || !result.filePaths[0]) return { canceled: true, count: 0 }
    return { canceled: false, count: await sceneSwapService.exportTo(result.filePaths[0], files) }
  })
}
