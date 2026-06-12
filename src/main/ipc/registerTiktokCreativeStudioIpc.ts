import type { IpcMain } from 'electron'
import { tiktokCreativeStudioService } from '../modules/tiktok-creative-studio/service'

export function registerTiktokCreativeStudioIpc(ipcMain: IpcMain) {
  ipcMain.handle('plugin:tiktokCreative:list', async () => await tiktokCreativeStudioService.list())
  ipcMain.handle('plugin:tiktokCreative:createDraftsFromCloneProjects', async (_e, payload: { cloneProjectIds: string[] }) => await tiktokCreativeStudioService.createDraftsFromCloneProjects(payload))
  ipcMain.handle('plugin:tiktokCreative:createDraftFromCloneProject', async (_e, payload: { cloneProjectId: string }) => await tiktokCreativeStudioService.createDraftFromCloneProject(payload))
  ipcMain.handle('plugin:tiktokCreative:startShot', async (_e, payload: { id: string; shotId: string }) => await tiktokCreativeStudioService.startShot(payload))
  ipcMain.handle('plugin:tiktokCreative:startNextPendingShot', async (_e, payload: { id: string }) => await tiktokCreativeStudioService.startNextPendingShot(payload))
  ipcMain.handle('plugin:tiktokCreative:markShotCompleted', async (_e, payload: { id: string; shotId: string; resultVideoPath: string }) => await tiktokCreativeStudioService.markShotCompleted(payload))
  ipcMain.handle('plugin:tiktokCreative:markShotFailed', async (_e, payload: { id: string; shotId: string; error: string }) => await tiktokCreativeStudioService.markShotFailed(payload))
  ipcMain.handle('plugin:tiktokCreative:remove', async (_e, id: string) => await tiktokCreativeStudioService.remove(id))
}
