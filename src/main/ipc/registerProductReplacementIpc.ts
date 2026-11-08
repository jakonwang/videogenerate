import type { IpcMain } from 'electron'
import { dialog } from 'electron'
import { productReplacementService } from '../modules/product-replacement/service'
import { assetLibraryService } from '../modules/asset-library/service'
import { cloneService } from '../modules/clone/service'

export function registerProductReplacementIpc(ipcMain: IpcMain) {
  ipcMain.handle('plugin:productReplacement:listProducts', () => productReplacementService.listProducts())
  ipcMain.handle('plugin:productReplacement:pickImages', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }] })
    if (result.canceled) return []
    return Promise.all(result.filePaths.map(async (path) => ({ path, name: path.split(/[\\/]/).pop() || path })))
  })
  ipcMain.handle('plugin:productReplacement:importPaths', (_event, paths: string[]) => productReplacementService.importImages(paths))
  ipcMain.handle('plugin:productReplacement:listBatches', () => productReplacementService.listBatches())
  ipcMain.handle('plugin:productReplacement:createBatch', async (_event, payload) => {
    assetLibraryService.setQiniuCredentials(await cloneService.getModelCredentials())
    return productReplacementService.createBatch(payload)
  })
  ipcMain.handle('plugin:productReplacement:pauseBatch', (_event, id: string) => productReplacementService.pauseBatch(id))
  ipcMain.handle('plugin:productReplacement:resumeBatch', (_event, id: string) => productReplacementService.resumeBatch(id))
  ipcMain.handle('plugin:productReplacement:cancelBatch', (_event, id: string) => productReplacementService.cancelBatch(id))
  ipcMain.handle('plugin:productReplacement:retryFailed', (_event, id: string) => productReplacementService.retryFailed(id))
  ipcMain.handle('plugin:productReplacement:listPromptVersions', () => productReplacementService.listPromptVersions())
  ipcMain.handle('plugin:productReplacement:savePromptVersion', (_event, payload) => productReplacementService.savePromptVersion(payload))
  ipcMain.handle('plugin:productReplacement:activatePromptVersion', (_event, id: string) => productReplacementService.activatePromptVersion(id))
  ipcMain.handle('plugin:productReplacement:rollbackPromptVersion', (_event, id: string) => productReplacementService.rollbackPromptVersion(id))
  ipcMain.handle('plugin:productReplacement:exportResults', (_event, paths: string[]) => productReplacementService.exportResults(paths))
}
