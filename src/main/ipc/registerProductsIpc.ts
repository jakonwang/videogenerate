import type { IpcMain } from 'electron'
import { cloneService } from '../modules/clone/service'
import { productsRepo } from '../modules/products/repo'

export function registerProductsIpc(ipcMain: IpcMain) {
  ipcMain.handle('products:list', async () => productsRepo.list())
  ipcMain.handle('products:upsert', async (_e, payload) => productsRepo.upsert(payload))
  ipcMain.handle('products:remove', async (_e, id: string) => productsRepo.remove(id))
  ipcMain.handle(
    'products:refreshCanonicalSource',
    async (_e, payload: { productId: string; force?: boolean }) => {
      return await cloneService.refreshLibraryProductCanonicalSource(payload)
    },
  )
  ipcMain.handle(
    'products:refreshProductAnalysis',
    async (_e, payload: { productId: string }) => {
      return await cloneService.refreshLibraryProductAnalysis(payload)
    },
  )
  ipcMain.handle('products:ensureSegmentBucketsFromTemplates', async () => productsRepo.ensureSegmentBucketsFromTemplates())
}
