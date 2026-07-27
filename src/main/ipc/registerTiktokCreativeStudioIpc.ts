import type { IpcMain } from 'electron'
import { tiktokCreativeStudioService } from '../modules/tiktok-creative-studio/service'

export function registerTiktokCreativeStudioIpc(ipcMain: IpcMain) {
  ipcMain.handle('plugin:tiktokCreative:list', async () => await tiktokCreativeStudioService.list())
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
  ipcMain.handle('plugin:tiktokCreative:exportItems', async (_e, payload) => await tiktokCreativeStudioService.exportItems(payload))
  ipcMain.handle('plugin:tiktokCreative:removeShot', async (_e, payload) => await tiktokCreativeStudioService.removeShot(payload))
  ipcMain.handle('plugin:tiktokCreative:generateSubtitles', async (_e, payload) => await tiktokCreativeStudioService.generateSubtitles(payload))
  ipcMain.handle('plugin:tiktokCreative:revertSubtitles', async (_e, payload) => await tiktokCreativeStudioService.revertSubtitles(payload))
  ipcMain.handle('plugin:tiktokCreative:remove', async (_e, id: string) => await tiktokCreativeStudioService.remove(id))
}
