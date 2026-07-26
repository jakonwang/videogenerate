import type { IpcMain } from 'electron'
import { livePhotoService } from '../modules/live-photo/service'
import { hermesDeliveryService } from '../modules/live-photo/hermesDelivery'

export function registerLivePhotoIpc(ipcMain: IpcMain) {
  ipcMain.handle('plugin:livePhoto:list', async () => await livePhotoService.list())
  ipcMain.handle(
    'plugin:livePhoto:listSummaries',
    async (_e, payload?: { page?: number; pageSize?: number; filter?: 'all' | 'failed' | 'running' | 'paused' }) =>
      await livePhotoService.listSummaries(payload),
  )
  ipcMain.handle('plugin:livePhoto:get', async (_e, id: string) => await livePhotoService.get(id))
  ipcMain.handle('plugin:livePhoto:getSettings', async () => await livePhotoService.getSettings())
  ipcMain.handle('plugin:livePhoto:saveSettings', async (_e, payload) => await livePhotoService.saveSettings(payload))
  ipcMain.handle('plugin:livePhoto:listPromptVersions', async () => await livePhotoService.listPromptVersions())
  ipcMain.handle('plugin:livePhoto:createPromptVersion', async (_e, payload) => await livePhotoService.createPromptVersion(payload))
  ipcMain.handle('plugin:livePhoto:updatePromptVersion', async (_e, payload) => await livePhotoService.updatePromptVersion(payload))
  ipcMain.handle('plugin:livePhoto:activatePromptVersion', async (_e, payload) => await livePhotoService.activatePromptVersion(payload))
  ipcMain.handle('plugin:livePhoto:rollbackPromptVersion', async (_e, payload) => await livePhotoService.rollbackPromptVersion(payload))
  ipcMain.handle('plugin:livePhoto:getQualityMetrics', async () => await livePhotoService.getQualityMetrics())
  ipcMain.handle('plugin:livePhoto:enqueueReference', async (_e, payload) => await livePhotoService.enqueueReferenceItems(payload))
  ipcMain.handle('plugin:livePhoto:startReference', async (_e, payload) => await livePhotoService.startReferenceItems(payload))
  ipcMain.handle('plugin:livePhoto:enqueueClone', async (_e, payload) => await livePhotoService.enqueueCloneItems(payload))
  ipcMain.handle('plugin:livePhoto:startClone', async (_e, payload) => await livePhotoService.startCloneItems(payload))
  ipcMain.handle('plugin:livePhoto:createFromReference', async (_e, payload) => await livePhotoService.createFromReference(payload))
  ipcMain.handle('plugin:livePhoto:createFromCloneShots', async (_e, payload) => await livePhotoService.createFromCloneShots(payload))
  ipcMain.handle(
    'plugin:livePhoto:applySubtitleVideoToItem',
    async (_e, payload: { id: string; subtitleVideoPath: string; subtitleCoverImagePath?: string }) =>
      await livePhotoService.applySubtitleVideoToItem(payload),
  )
  ipcMain.handle(
    'plugin:livePhoto:revertSubtitleVideoFromItem',
    async (_e, payload: { id: string }) => await livePhotoService.revertSubtitleVideoFromItem(payload),
  )
  ipcMain.handle(
    'plugin:livePhoto:generateSubtitleVideosForItems',
    async (_e, payload) => await livePhotoService.generateSubtitleVideosForItems(payload),
  )
  ipcMain.handle(
    'plugin:livePhoto:retry',
    async (_e, payload: {
      id: string
      motionTemplate?: 'push_in' | 'push_out' | 'ambient_sway'
      replacementRegion?: { x: number; y: number; width: number; height: number }
    }) =>
      await livePhotoService.retry(payload),
  )
  ipcMain.handle(
    'plugin:livePhoto:exportItems',
    async (
      _e,
      payload: {
        ids: string[]
        outputDir?: string
        settings?: {
          referenceMotionTemplate?: 'push_in' | 'push_out' | 'ambient_sway'
          cloneMotionTemplate?: 'push_in' | 'push_out' | 'ambient_sway'
          outputResolution?: '1080x1440' | '2160x2880' | '3024x4032'
          frameRate?: '24' | '30'
          quality?: 'medium' | 'high'
        }
      },
    ) => await livePhotoService.exportItems(payload),
  )
  ipcMain.handle(
    'plugin:livePhoto:sendItemsToFeishu',
    async (_e, payload: { ids: string[] }) => await hermesDeliveryService.sendLivePhotoItemsToFeishu(payload),
  )
  ipcMain.handle('plugin:livePhoto:remove', async (_e, id: string) => await livePhotoService.remove(id))
  ipcMain.handle('plugin:livePhoto:pauseAutoFlow', async (_e, payload: { id: string }) => await livePhotoService.pauseAutoFlow(payload))
  ipcMain.handle(
    'plugin:livePhoto:resumeAutoFlow',
    async (_e, payload: { id: string; motionTemplate?: 'push_in' | 'push_out' | 'ambient_sway' }) =>
      await livePhotoService.resumeAutoFlow(payload),
  )
}
