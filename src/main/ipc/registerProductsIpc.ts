import type { IpcMain } from 'electron'
import { cloneService } from '../modules/clone/service'
import { productsRepo } from '../modules/products/repo'
import { productAnalysisBoardPromptVersionService } from '../modules/products/promptVersions'

export function registerProductsIpc(ipcMain: IpcMain) {
  ipcMain.handle('products:list', async () => productsRepo.list())
  ipcMain.handle('products:upsert', async (_e, payload) => productsRepo.upsert(payload))
  ipcMain.handle('products:remove', async (_e, id: string) => productsRepo.remove(id))
  ipcMain.handle('products:listPromptVersions', async () => productAnalysisBoardPromptVersionService.list())
  ipcMain.handle('products:savePromptVersion', async (_e, payload) => productAnalysisBoardPromptVersionService.save(payload))
  ipcMain.handle('products:activatePromptVersion', async (_e, id: string) => productAnalysisBoardPromptVersionService.activate(id))
  ipcMain.handle('products:rollbackPromptVersion', async (_e, id: string) => productAnalysisBoardPromptVersionService.rollback(id))
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
