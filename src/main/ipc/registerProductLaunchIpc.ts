import type { IpcMain } from 'electron'
import { productLaunchService } from '../modules/product-launch/service'

export function registerProductLaunchIpc(ipcMain: IpcMain) {
  ipcMain.handle('productLaunch:info', async () => await productLaunchService.info())
  ipcMain.handle('productLaunch:list', async () => await productLaunchService.list())
  ipcMain.handle('productLaunch:get', async (_e, id: string) => await productLaunchService.get(id))
  ipcMain.handle('productLaunch:create', async (_e, input) => await productLaunchService.create(input))
  ipcMain.handle('productLaunch:retry', async (_e, input) => await productLaunchService.retry(input))
  ipcMain.handle('productLaunch:skip', async (_e, input) => await productLaunchService.skip(input))
  ipcMain.handle('productLaunch:setPaused', async (_e, input) => await productLaunchService.setPaused(input))
  ipcMain.handle('productLaunch:remove', async (_e, id: string) => await productLaunchService.remove(id))
  void productLaunchService.resume().catch((error) => console.error('[product-launch] resume failed', error))
}
