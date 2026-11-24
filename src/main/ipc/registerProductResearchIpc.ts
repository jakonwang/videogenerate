import type { IpcMain } from 'electron'
import { productResearchService } from '../modules/product-research/service'

export function registerProductResearchIpc(ipcMain: IpcMain) {
  ipcMain.handle('productResearch:snapshot', (_event, schemeId?: string) => productResearchService.snapshot(schemeId))
  ipcMain.handle('productResearch:createPairing', () => productResearchService.createPairing())
  ipcMain.handle('productResearch:firewallStatus', () => productResearchService.firewallStatus())
  ipcMain.handle('productResearch:allowFirewall', () => productResearchService.allowFirewall())
  ipcMain.handle('productResearch:createTask', (_event, payload) => productResearchService.createTask(payload))
  ipcMain.handle('productResearch:cancelTask', (_event, taskId: string) => productResearchService.cancelTask(taskId))
  ipcMain.handle('productResearch:removeTask', (_event, taskId: string) => productResearchService.removeTask(taskId))
  ipcMain.handle('productResearch:removeResult', (_event, payload: { resultId: string; schemeId?: string }) => productResearchService.removeResult(payload.resultId, payload.schemeId))
  ipcMain.handle('productResearch:removeResults', (_event, payload: { resultIds: string[]; schemeId?: string }) => productResearchService.removeResults(payload.resultIds, payload.schemeId))
  ipcMain.handle('productResearch:clearResults', (_event, schemeId?: string) => productResearchService.clearResults(schemeId))
  ipcMain.handle('productResearch:createScheme', (_event, payload) => productResearchService.createScheme(payload))
  ipcMain.handle('productResearch:listSchemes', () => productResearchService.listSchemes())
  ipcMain.handle('productResearch:updateScheme', (_event, id: string, patch) => productResearchService.updateScheme(id, patch))
  ipcMain.handle('productResearch:deleteScheme', (_event, id: string) => productResearchService.deleteScheme(id))
  ipcMain.handle('productResearch:getSchemeState', (_event, id: string) => productResearchService.getSchemeState(id))
  ipcMain.handle('productResearch:saveSchemeState', (_event, id: string, patch) => productResearchService.saveSchemeState(id, patch))
}
