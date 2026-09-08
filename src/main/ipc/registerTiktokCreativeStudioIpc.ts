import type { IpcMain } from 'electron'
import { tiktokCreativeStudioService } from '../modules/tiktok-creative-studio/service'
import { creatokPublisherService } from '../modules/tiktok-publisher/service'

export function registerTiktokCreativeStudioIpc(ipcMain: IpcMain) {
  ipcMain.handle('plugin:tiktokCreative:list', async () => await tiktokCreativeStudioService.list())
  ipcMain.handle('plugin:tiktokCreative:getSettings', async () => await tiktokCreativeStudioService.getSettings())
  ipcMain.handle('plugin:tiktokCreative:saveSettings', async (_e, payload) => await tiktokCreativeStudioService.saveSettings(payload))
  ipcMain.handle('plugin:tiktokCreative:listAccounts', async () => await tiktokCreativeStudioService.listAccounts())
  ipcMain.handle('plugin:tiktokCreative:listPromptVersions', async () => await tiktokCreativeStudioService.listPromptVersions())
  ipcMain.handle('plugin:tiktokCreative:createPromptVersion', async (_e, payload) => await tiktokCreativeStudioService.createPromptVersion(payload))
  ipcMain.handle('plugin:tiktokCreative:updatePromptVersion', async (_e, payload) => await tiktokCreativeStudioService.updatePromptVersion(payload))
  ipcMain.handle('plugin:tiktokCreative:activatePromptVersion', async (_e, payload) => await tiktokCreativeStudioService.activatePromptVersion(payload))
  ipcMain.handle('plugin:tiktokCreative:rollbackPromptVersion', async (_e, payload) => await tiktokCreativeStudioService.rollbackPromptVersion(payload))
  ipcMain.handle('plugin:tiktokCreative:importAccount', async (_e, payload) => await tiktokCreativeStudioService.importAccount(payload))
  ipcMain.handle('plugin:tiktokCreative:updateAccount', async (_e, payload) => await tiktokCreativeStudioService.updateAccount(payload))
  ipcMain.handle('plugin:tiktokCreative:testAccount', async (_e, id: string) => await tiktokCreativeStudioService.testAccount(id))
  ipcMain.handle('plugin:tiktokCreative:removeAccount', async (_e, id: string) => await tiktokCreativeStudioService.removeAccount(id))
  ipcMain.handle('plugin:tiktokCreative:createFromReference', async (_e, payload) => await tiktokCreativeStudioService.createFromReference(payload))
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
  ipcMain.handle('plugin:tiktokPublisher:music', async (_e, query: string, connection?: string) => await creatokPublisherService.music(query, connection))
  ipcMain.handle('plugin:tiktokPublisher:listTasks', async () => await creatokPublisherService.listTasks())
  ipcMain.handle('plugin:tiktokPublisher:removeTask', async (_e, id: string) => await creatokPublisherService.removeTask(id))
  ipcMain.handle('plugin:tiktokPublisher:updateTask', async (_e, id: string, patch) => await creatokPublisherService.updateTask(id, patch))
  ipcMain.handle('plugin:tiktokPublisher:createDrafts', async (_e, payload) => await creatokPublisherService.createDrafts(payload))
  ipcMain.handle('plugin:tiktokPublisher:createDraftsFromPaths', async (_e, payload) => await creatokPublisherService.createDraftsFromPaths(payload))
  ipcMain.handle('plugin:tiktokPublisher:precheck', async (_e, ids: string[]) => await creatokPublisherService.precheck(ids))
  ipcMain.handle('plugin:tiktokPublisher:submit', async (_e, ids: string[]) => await creatokPublisherService.submit(ids))
  ipcMain.handle('plugin:tiktokPublisher:refresh', async () => await creatokPublisherService.refresh())
}
