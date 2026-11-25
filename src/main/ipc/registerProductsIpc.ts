import { writeFile } from 'node:fs/promises'
import { dialog, type IpcMain } from 'electron'
import { applyImport, exportCodes, previewImport } from '../modules/product-codes/library'
import { cloneService } from '../modules/clone/service'
import { productCodesService } from '../modules/product-codes/service'
import { productsRepo } from '../modules/products/repo'
import { productAnalysisBoardPromptVersionService } from '../modules/products/promptVersions'

export function registerProductsIpc(ipcMain: IpcMain) {
  ipcMain.handle('products:list', async () => productsRepo.list())
  ipcMain.handle('products:upsert', async (_e, payload) => {
    if (payload?.code === undefined) return productsRepo.upsert(payload)
    const code = await productCodesService.prepare(payload.code, payload.id)
    const saved = await productsRepo.upsert({ ...payload, code })
    if (code) await productCodesService.remember([code])
    return saved
  })
  ipcMain.handle('productCodes:overview', async () => productCodesService.overview())
  ipcMain.handle('productCodes:links', async (_e, code: string) => productCodesService.links(code))
  ipcMain.handle('productCodes:next', async (_e, payload: { start: string; count?: number; reserved?: string[] }) => productCodesService.next(payload))
  ipcMain.handle('productCodes:stats', async () => productCodesService.stats())
  ipcMain.handle('productCodes:detail', async (_e, code: string) => productCodesService.detail(code))
  ipcMain.handle('productCodes:board', async () => productCodesService.board())
  ipcMain.handle('productCodes:researchYield', async (_e, by: 'keyword' | 'source' | 'price') => productCodesService.researchYield(by))
  ipcMain.handle('productCodes:archive', async (_e, code: string) => productCodesService.archive(code))
  ipcMain.handle('productCodes:importPreview', async () => {
    const picked = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm', 'xls', 'csv'] }] })
    return picked.canceled || !picked.filePaths[0] ? null : previewImport(picked.filePaths[0])
  })
  ipcMain.handle('productCodes:importApply', async (_e, token: string) => applyImport(token))
  ipcMain.handle('productCodes:export', async () => {
    const { data, count } = await exportCodes()
    if (!count) return { count: 0 }
    const picked = await dialog.showSaveDialog({ defaultPath: `款号表_${new Date().toISOString().slice(0, 10)}.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }] })
    if (picked.canceled || !picked.filePath) return { count, canceled: true }
    await writeFile(picked.filePath, data)
    return { count, path: picked.filePath }
  })
  ipcMain.handle('productCodes:applySuggestions', async () => productCodesService.applySuggestions())
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
