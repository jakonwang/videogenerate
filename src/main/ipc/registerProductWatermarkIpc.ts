import type { IpcMain } from 'electron'
import { productWatermarkService } from '../modules/product-watermark/service'
export function registerProductWatermarkIpc(ipcMain: IpcMain) {
  ipcMain.handle('productWatermark:listTemplates', () => productWatermarkService.listTemplates())
  ipcMain.handle('productWatermark:saveTemplate', (_e, payload) => productWatermarkService.saveTemplate({
    filePath: String(payload?.filePath || ''),
    name: String(payload?.name || ''),
  }))
  ipcMain.handle('productWatermark:renameTemplate', (_e, payload) => productWatermarkService.renameTemplate({
    id: String(payload?.id || ''),
    name: String(payload?.name || ''),
  }))
  ipcMain.handle('productWatermark:deleteTemplate', (_e, id: string) => productWatermarkService.deleteTemplate(String(id || '')))
  ipcMain.handle('productWatermark:processBatch', (_e, payload) => productWatermarkService.processBatch({
    templateId: String(payload?.templateId || ''),
    sourcePaths: Array.isArray(payload?.sourcePaths) ? payload.sourcePaths.map((path: unknown) => String(path)) : [],
    outputDir: String(payload?.outputDir || ''),
  }))
}
