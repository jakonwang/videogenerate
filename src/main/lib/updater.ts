import { app, ipcMain, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { getAppEnv, isDevelopmentEnv } from './appEnv'

const DEFAULT_GENERIC_URL = 'https://YOUR_UPDATE_URL'

let getMainWindow: () => BrowserWindow | null = () => null

function resolveUpdateBaseUrl(): string {
  return (process.env.VG_UPDATE_BASE_URL || DEFAULT_GENERIC_URL).trim().replace(/\/+$/, '')
}

function isUpdaterConfigured(): boolean {
  if (!app.isPackaged) return false
  const env = getAppEnv()
  const url = resolveUpdateBaseUrl()
  const envAllowsUpdater = env === 'staging' || env === 'production'
  return Boolean(envAllowsUpdater && url && !url.includes('YOUR_UPDATE_URL'))
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
    if (isDevelopmentEnv()) {
      return { ok: false, reason: 'dev_env_disabled' as const }
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
        `[updater] auto update disabled: env=${getAppEnv()} requires staging/production with a real VG_UPDATE_BASE_URL`,
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
