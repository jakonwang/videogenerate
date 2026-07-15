import type { IpcMain } from 'electron'
import { productImageMaterialsService } from '../modules/product-image-materials/service'

export function registerProductImageMaterialsIpc(ipcMain: IpcMain) {
  ipcMain.handle('plugin:productImageMaterials:listCategories', async () => productImageMaterialsService.listCategories())
  ipcMain.handle('plugin:productImageMaterials:createBatch', async (_e, payload) =>
    await productImageMaterialsService.createBatch(payload),
  )
  ipcMain.handle('plugin:productImageMaterials:listBatches', async (_e, payload: { userId: string }) =>
    await productImageMaterialsService.listBatches(payload.userId),
  )
  ipcMain.handle('plugin:productImageMaterials:retryBatch', async (_e, payload: { userId: string; batchId: string }) =>
    await productImageMaterialsService.retryBatch(payload),
  )
  ipcMain.handle('plugin:productImageMaterials:createBackgroundVariants', async (_e, payload: {
    userId: string
    materialIds: string[]
    variantCount: number
  }) => await productImageMaterialsService.createBackgroundVariants(payload))
  ipcMain.handle('plugin:productImageMaterials:listMaterials', async (_e, payload: any) =>
    await productImageMaterialsService.listMaterials(payload.userId, payload.filters),
  )
  ipcMain.handle('plugin:productImageMaterials:updateUsageStatus', async (_e, payload: any) =>
    await productImageMaterialsService.updateMaterialUsageStatus(payload),
  )
  ipcMain.handle('plugin:productImageMaterials:bindProduct', async (_e, payload: any) =>
    await productImageMaterialsService.bindMaterialProduct(payload),
  )
  ipcMain.handle('plugin:productImageMaterials:deleteMaterial', async (_e, payload: { userId: string; materialId: string }) =>
    await productImageMaterialsService.deleteMaterial(payload),
  )
  ipcMain.handle('plugin:productImageMaterials:deleteMaterials', async (_e, payload: { userId: string; materialIds: string[] }) =>
    await productImageMaterialsService.deleteMaterials(payload),
  )
  ipcMain.handle('plugin:productImageMaterials:exportMaterials', async (_e, payload: { userId: string; materialIds: string[]; outputDir: string }) =>
    await productImageMaterialsService.exportMaterials(payload),
  )
  ipcMain.handle('plugin:productImageMaterials:listProducts', async () =>
    await productImageMaterialsService.listProductBindingOptions(),
  )
}
