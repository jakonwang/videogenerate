import { app, ipcMain, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

/** 更新服务器地址在打包时写入（VG_UPDATE_BASE_URL），见 docs/commercial-deployment.md */
declare const __VG_UPDATE_BASE_URL__: string | undefined
const DEFAULT_GENERIC_URL = 'https://YOUR_UPDATE_URL'

let getMainWindow: () => BrowserWindow | null = () => null

function resolveUpdateBaseUrl(): string {
  const builtIn = typeof __VG_UPDATE_BASE_URL__ !== 'undefined' ? __VG_UPDATE_BASE_URL__ : ''
  return (builtIn || DEFAULT_GENERIC_URL).trim().replace(/\/+$/, '')
}

/** 只有打包后的程序、且打包时配置了真实的更新地址，才启用自动更新 */
function isUpdaterConfigured(): boolean {
  if (!app.isPackaged) return false
  const url = resolveUpdateBaseUrl()
  return Boolean(url && !url.includes('YOUR_UPDATE_URL') && /^https?:\/\//.test(url))
}

export function registerUpdaterIpc(getWindow: () => BrowserWindow | null) {
  getMainWindow = getWindow

  ipcMain.handle('updater:quitAndInstall', async () => {
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  })

  ipcMain.handle('updater:checkForUpdates', async () => {
    if (!app.isPackaged) {
      return { ok: false, reason: 'not_packaged' as const }
    }
    if (!isUpdaterConfigured()) {
      return { ok: false, reason: 'url_not_configured' as const }
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      return { ok: true, updateInfo: result?.updateInfo ?? null }
    } catch (error: any) {
      return { ok: false, reason: 'check_failed' as const, message: error?.message ?? String(error) }
    }
  })
}

export function setupAutoUpdater(getWindow: () => BrowserWindow | null) {
  getMainWindow = getWindow
  if (!isUpdaterConfigured()) {
    if (app.isPackaged) {
      console.warn(
        '[updater] auto update disabled: build with VG_UPDATE_BASE_URL=https://<update-host>/<path> to enable',
      )
    }
    return
  }

  const url = resolveUpdateBaseUrl()
  autoUpdater.setFeedURL({ provider: 'generic', url })
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-downloaded', (info) => {
    getMainWindow()?.webContents.send('updater:update-downloaded', {
      version: info.version,
    })
  })

  autoUpdater.on('error', (error) => {
    console.warn('[updater]', error?.message ?? error)
  })

  const delayMs = Number(process.env.VG_UPDATE_CHECK_DELAY_MS || 8000)
  setTimeout(() => {
    checkForUpdates().catch(() => {})
  }, delayMs)
}

export async function checkForUpdates() {
  if (!isUpdaterConfigured()) return
  await autoUpdater.checkForUpdates()
}
