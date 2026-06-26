import type { IpcMain } from 'electron'
import { livePhotoService } from '../modules/live-photo/service'

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
  ipcMain.handle('plugin:livePhoto:enqueueReference', async (_e, payload) => await livePhotoService.enqueueReferenceItems(payload))
  ipcMain.handle('plugin:livePhoto:startReference', async (_e, payload) => await livePhotoService.startReferenceItems(payload))
  ipcMain.handle('plugin:livePhoto:enqueueClone', async (_e, payload) => await livePhotoService.enqueueCloneItems(payload))
  ipcMain.handle('plugin:livePhoto:startClone', async (_e, payload) => await livePhotoService.startCloneItems(payload))
  ipcMain.handle('plugin:livePhoto:createFromReference', async (_e, payload) => await livePhotoService.createFromReference(payload))
  ipcMain.handle('plugin:livePhoto:createFromCloneShots', async (_e, payload) => await livePhotoService.createFromCloneShots(payload))
  ipcMain.handle(
    'plugin:livePhoto:retry',
    async (_e, payload: { id: string; motionTemplate?: 'push_in' | 'push_out' | 'ambient_sway' }) =>
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
  ipcMain.handle('plugin:livePhoto:remove', async (_e, id: string) => await livePhotoService.remove(id))
  ipcMain.handle('plugin:livePhoto:pauseAutoFlow', async (_e, payload: { id: string }) => await livePhotoService.pauseAutoFlow(payload))
  ipcMain.handle(
    'plugin:livePhoto:resumeAutoFlow',
    async (_e, payload: { id: string; motionTemplate?: 'push_in' | 'push_out' | 'ambient_sway' }) =>
      await livePhotoService.resumeAutoFlow(payload),
  )
}
