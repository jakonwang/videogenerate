import type { BrowserWindow, IpcMain } from 'electron'
import { contentHubService } from '../modules/content-hub/service'

const EVENT_CHANNEL = 'contentHub:changed'

export function registerContentHubIpc(ipcMain: IpcMain, getWindow: () => BrowserWindow | null) {
  ipcMain.handle('contentHub:listContent', async (_event, payload) => await contentHubService.listContent(payload))
  ipcMain.handle('contentHub:recentProjects', async (_event, limit?: number) => await contentHubService.recentProjects(limit))
  ipcMain.handle('contentHub:productOverview', async (_event, productId: string) => await contentHubService.productOverview(productId))

  ipcMain.handle('contentHub:linkProductChannels', async (_event, payload) => await contentHubService.linkProductChannels(payload))

  ipcMain.handle('contentHub:linkContentPerformance', async (_event, payload) => await contentHubService.linkContentPerformance(payload))
  ipcMain.handle('contentHub:unlinkContentPerformance', async (_event, ref: string) => await contentHubService.unlinkContentPerformance(ref))

  ipcMain.handle('contentHub:listReviews', async (_event, payload) => await contentHubService.listReviews(payload))
  ipcMain.handle('contentHub:reviewCounts', async () => await contentHubService.reviewCounts())
  ipcMain.handle('contentHub:decideReview', async (_event, payload) => await contentHubService.decideReview(payload))
  ipcMain.handle('contentHub:reopenReview', async (_event, ref: string) => await contentHubService.reopenReview(ref))

  ipcMain.handle('contentHub:lineageFor', async (_event, ref: string) => await contentHubService.lineageFor(ref))

  ipcMain.handle('contentHub:getBrandMemory', async () => await contentHubService.getBrandMemory())
  ipcMain.handle('contentHub:saveBrand', async (_event, payload) => await contentHubService.saveBrand(payload))
  ipcMain.handle('contentHub:getProductMemory', async (_event, productId: string) => await contentHubService.getProductMemory(productId))
  ipcMain.handle('contentHub:saveProductMemory', async (_event, payload) => await contentHubService.saveProductMemory(payload))
  ipcMain.handle('contentHub:removeFeedback', async (_event, id: string) => await contentHubService.removeFeedback(id))

  ipcMain.handle('contentHub:healthCheck', async (_event, force?: boolean) => await contentHubService.healthCheck(Boolean(force)))
  ipcMain.handle('contentHub:overview', async (_event, rangeDays?: number) => await contentHubService.overview(Number(rangeDays) || 7))
  ipcMain.handle('contentHub:insights', async (_event, rangeDays?: number) => await contentHubService.insights(rangeDays))
  ipcMain.handle('contentHub:latestBriefs', async () => await contentHubService.latestBriefs())
  ipcMain.handle('contentHub:generateBrief', async (_event, kind: 'daily' | 'weekly') => await contentHubService.generateBrief(kind))
  ipcMain.handle('contentHub:listBriefs', async (_event, limit?: number) => await contentHubService.listBriefs(limit))
  ipcMain.handle('contentHub:getAutomationSettings', async () => await contentHubService.getAutomationSettings())
  ipcMain.handle('contentHub:saveAutomationSettings', async (_event, payload) => await contentHubService.saveAutomationSettings(payload))
  ipcMain.handle('contentHub:testFeishuPush', async (_event, payload) => await contentHubService.testFeishuPush(payload))
  ipcMain.handle('contentHub:pushLatestBrief', async (_event, kind: 'daily' | 'weekly') => await contentHubService.pushLatestBrief(kind === 'weekly' ? 'weekly' : 'daily'))

  ipcMain.handle('contentHub:importProductFromLink', async (_event, payload) => await contentHubService.importProductFromLink(payload))

  contentHubService.init()
  return contentHubService.subscribe((payload) => {
    const window = getWindow()
    if (!window || window.isDestroyed()) return
    window.webContents.send(EVENT_CHANNEL, payload)
  })
}
