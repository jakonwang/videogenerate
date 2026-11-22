import { geelarkWarmup } from '../modules/tiktok-publisher/geelarkWarmup'
import type { BrowserWindow, IpcMain } from 'electron'
import { tiktokCreativeStudioService } from '../modules/tiktok-creative-studio/service'
import { creatokPublisherService } from '../modules/tiktok-publisher/service'
import { publishMatrixService } from '../modules/tiktok-publisher/matrix'
import { publishLocalizeService } from '../modules/tiktok-publisher/localize'
import { geelarkPublisher } from '../modules/tiktok-publisher/geelark'
import { creatokPublisherRepo } from '../modules/tiktok-publisher/repo'
import { publishProfitReport } from '../modules/content-hub/publishProfit'

export function registerTiktokCreativeStudioIpc(ipcMain: IpcMain, getWindow: () => BrowserWindow | null = () => null) {
  ipcMain.handle('plugin:tiktokCreative:list', async () => await tiktokCreativeStudioService.list())
  ipcMain.handle('plugin:tiktokCreative:listSummary', async (_e, payload?: { ids?: string[] }) => await tiktokCreativeStudioService.listSummary(payload))
  ipcMain.handle('plugin:tiktokCreative:getTask', async (_e, id: string) => await tiktokCreativeStudioService.getTask(id))
  tiktokCreativeStudioService.subscribeChanges((taskIds) => {
    const window = getWindow()
    if (!window || window.isDestroyed()) return
    window.webContents.send('plugin:tiktokCreative:changed', { taskIds })
  })
  ipcMain.handle('plugin:tiktokCreative:getSettings', async () => await tiktokCreativeStudioService.getSettings())
  ipcMain.handle('plugin:tiktokCreative:saveSettings', async (_e, payload) => await tiktokCreativeStudioService.saveSettings(payload))
  ipcMain.handle('plugin:tiktokCreative:listAccounts', async () => await tiktokCreativeStudioService.listAccounts())
  ipcMain.handle(
    'plugin:tiktokCreative:listPromptVersions',
    async (_e, kind?: 'image' | 'video') => await tiktokCreativeStudioService.listPromptVersions(kind),
  )
  ipcMain.handle('plugin:tiktokCreative:createPromptVersion', async (_e, payload) => await tiktokCreativeStudioService.createPromptVersion(payload))
  ipcMain.handle('plugin:tiktokCreative:updatePromptVersion', async (_e, payload) => await tiktokCreativeStudioService.updatePromptVersion(payload))
  ipcMain.handle('plugin:tiktokCreative:activatePromptVersion', async (_e, payload) => await tiktokCreativeStudioService.activatePromptVersion(payload))
  ipcMain.handle('plugin:tiktokCreative:rollbackPromptVersion', async (_e, payload) => await tiktokCreativeStudioService.rollbackPromptVersion(payload))
  ipcMain.handle('plugin:tiktokCreative:importAccount', async (_e, payload) => await tiktokCreativeStudioService.importAccount(payload))
  ipcMain.handle('plugin:tiktokCreative:updateAccount', async (_e, payload) => await tiktokCreativeStudioService.updateAccount(payload))
  ipcMain.handle('plugin:tiktokCreative:testAccount', async (_e, id: string) => await tiktokCreativeStudioService.testAccount(id))
  ipcMain.handle('plugin:tiktokCreative:removeAccount', async (_e, id: string) => await tiktokCreativeStudioService.removeAccount(id))
  ipcMain.handle('plugin:tiktokCreative:createFromReference', async (_e, payload) => await tiktokCreativeStudioService.createFromReference(payload))
  ipcMain.handle('plugin:tiktokCreative:createFromStyleReference', async (_e, payload) => await tiktokCreativeStudioService.createFromStyleReference(payload))
  ipcMain.handle(
    'plugin:tiktokCreative:retryShot',
    async (_e, payload: {
      id: string
      shotId: string
      replacementRegion?: { x: number; y: number; width: number; height: number }
    }) => await tiktokCreativeStudioService.retryShot(payload),
  )
  ipcMain.handle('plugin:tiktokCreative:continueWithVideo', async (_e, payload) => await tiktokCreativeStudioService.continueWithVideo(payload))
  ipcMain.handle('plugin:tiktokCreative:exportItems', async (_e, payload) => await tiktokCreativeStudioService.exportItems(payload))
  ipcMain.handle('plugin:tiktokCreative:removeShot', async (_e, payload) => await tiktokCreativeStudioService.removeShot(payload))
  ipcMain.handle('plugin:tiktokCreative:generateSubtitles', async (_e, payload) => await tiktokCreativeStudioService.generateSubtitles(payload))
  ipcMain.handle('plugin:tiktokCreative:revertSubtitles', async (_e, payload) => await tiktokCreativeStudioService.revertSubtitles(payload))
  ipcMain.handle('plugin:tiktokCreative:revertSubtitlesBatch', async (_e, payload) => await tiktokCreativeStudioService.revertSubtitlesBatch(payload))
  ipcMain.handle('plugin:tiktokCreative:remove', async (_e, id: string) => await tiktokCreativeStudioService.remove(id))
  ipcMain.handle('plugin:tiktokPublisher:credentialStatus', async () => await creatokPublisherService.credentialStatus())
  ipcMain.handle('plugin:tiktokPublisher:saveCredential', async (_e, key: string) => await creatokPublisherService.saveCredential(key))
  ipcMain.handle('plugin:tiktokPublisher:clearCredential', async () => await creatokPublisherService.clearCredential())
  ipcMain.handle('plugin:tiktokPublisher:testCredential', async () => await creatokPublisherService.testCredential())
  ipcMain.handle('plugin:tiktokPublisher:connections', async () => await creatokPublisherService.connections())
  ipcMain.handle('plugin:tiktokPublisher:products', async (_e, connection?: string) => await creatokPublisherService.products(connection))
  ipcMain.handle('plugin:tiktokPublisher:productsPage', async (_e, connection?: string, options?: { pageSize?: number; pageToken?: string; query?: string; includeTotal?: boolean }) => await creatokPublisherService.productsPage(connection, options))
  ipcMain.handle('plugin:tiktokPublisher:music', async (_e, query: string, connection?: string) => await creatokPublisherService.music(query, connection))
  ipcMain.handle('plugin:tiktokPublisher:listTasks', async () => await creatokPublisherService.listTasks())
  ipcMain.handle('plugin:tiktokPublisher:removeTask', async (_e, id: string) => await creatokPublisherService.removeTask(id))
  ipcMain.handle('plugin:tiktokPublisher:updateTask', async (_e, id: string, patch) => await creatokPublisherService.updateTask(id, patch))
  ipcMain.handle('plugin:tiktokPublisher:createDrafts', async (_e, payload) => await creatokPublisherService.createDrafts(payload))
  ipcMain.handle('plugin:tiktokPublisher:createDraftsFromPaths', async (_e, payload) => await creatokPublisherService.createDraftsFromPaths(payload))
  ipcMain.handle('plugin:tiktokPublisher:precheck', async (_e, ids: string[]) => await creatokPublisherService.precheck(ids))
  ipcMain.handle('plugin:tiktokPublisher:submit', async (_e, ids: string[]) => await creatokPublisherService.submit(ids))
  ipcMain.handle('plugin:tiktokPublisher:refresh', async () => await creatokPublisherService.refresh())
  ipcMain.handle('plugin:tiktokPublisher:matrixAccounts', async () => await publishMatrixService.accounts())
  ipcMain.handle('plugin:tiktokPublisher:matrixSaveAccounts', async (_e, list) => await publishMatrixService.saveAccounts(list))
  ipcMain.handle('plugin:tiktokPublisher:matrixDistribute', async (_e, payload) => await publishMatrixService.distribute(payload))
  ipcMain.handle('plugin:tiktokPublisher:matrixRetryVariants', async (_e, ids: string[]) => await publishMatrixService.retryVariants(ids))
  ipcMain.handle('plugin:tiktokPublisher:localizeCreate', async (_e, payload) => await publishLocalizeService.create(payload))
  ipcMain.handle('plugin:tiktokPublisher:localizeRetry', async (_e, ids: string[]) => await publishLocalizeService.retry(ids))
  ipcMain.handle('plugin:tiktokPublisher:geelarkStatus', async () => await geelarkPublisher.status())
  ipcMain.handle('plugin:tiktokPublisher:geelarkSave', async (_e, payload) => await geelarkPublisher.save(payload || {}))
  ipcMain.handle('plugin:tiktokPublisher:geelarkClear', async () => await geelarkPublisher.clear())
  ipcMain.handle('plugin:tiktokPublisher:geelarkTest', async () => await geelarkPublisher.test())
  ipcMain.handle('plugin:tiktokPublisher:warmupStatus', async () => await geelarkWarmup.status())
  ipcMain.handle('plugin:tiktokPublisher:warmupRunNow', async () => { const result = await geelarkWarmup.run(); return { ...result, status: await geelarkWarmup.status() } })
  ipcMain.handle('plugin:tiktokPublisher:profitReport', async () => publishProfitReport(await creatokPublisherRepo.list()))
  ipcMain.handle('plugin:tiktokPublisher:matrixUseOriginal', async (_e, ids: string[]) => await publishMatrixService.useOriginal(ids))
}
