import type { IpcMain } from 'electron'
import { liveAccountsService } from '../modules/live-accounts/service'

/** 直播账号带着电脑上的登录，只在桌面端提供。 */
export function registerLiveAccountsIpc(ipcMain: IpcMain) {
  liveAccountsService.startScheduler()
  ipcMain.handle('plugin:liveAccounts:list', async () => liveAccountsService.list())
  ipcMain.handle('plugin:liveAccounts:importCookies', async (_e, payload) => liveAccountsService.importCookies(payload))
  ipcMain.handle('plugin:liveAccounts:verify', async (_e, id: string) => liveAccountsService.verify(id))
  ipcMain.handle('plugin:liveAccounts:rename', async (_e, payload: { id: string; name: string }) => liveAccountsService.rename(payload.id, payload.name))
  ipcMain.handle('plugin:liveAccounts:remove', async (_e, id: string) => liveAccountsService.remove(id))
  ipcMain.handle('plugin:liveAccounts:openBackend', async (_e, id: string) => liveAccountsService.openBackend(id))
  ipcMain.handle('plugin:liveAccounts:sync', async (_e, payload) => {
    void liveAccountsService.sync(payload).catch((error) => console.warn('[live-accounts] sync failed', error instanceof Error ? error.message : error))
    return { started: true as const }
  })
  ipcMain.handle('plugin:liveAccounts:getProgress', async () => liveAccountsService.getProgress())
  ipcMain.handle('plugin:liveAccounts:overview', async (_e, payload) => liveAccountsService.overview(payload))
}
