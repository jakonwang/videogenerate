import { app, ipcMain, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

/** 与 package.json publish / 环境变量一致；部署时改为真实 HTTPS 目录（内含 latest.yml 与安装包） */
const DEFAULT_GENERIC_URL = 'https://YOUR_UPDATE_URL'

let getMainWindow: () => BrowserWindow | null = () => null

function resolveUpdateBaseUrl(): string {
  const raw = (process.env.VG_UPDATE_BASE_URL || DEFAULT_GENERIC_URL).trim().replace(/\/+$/, '')
  return raw
}

function isUpdaterConfigured(): boolean {
  if (!app.isPackaged) return false
  const url = resolveUpdateBaseUrl()
  return Boolean(url && !url.includes('YOUR_UPDATE_URL'))
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
      const r = await autoUpdater.checkForUpdates()
      return { ok: true, updateInfo: r?.updateInfo ?? null }
    } catch (e: any) {
      return { ok: false, reason: 'check_failed' as const, message: e?.message ?? String(e) }
    }
  })
}

/**
 * 配置 generic 源并延迟检查更新；下载完成后通过 IPC `updater:update-downloaded` 通知渲染进程。
 */
export function setupAutoUpdater(getWindow: () => BrowserWindow | null) {
  getMainWindow = getWindow
  if (!isUpdaterConfigured()) {
    if (app.isPackaged) {
      console.warn('[updater] 未配置有效更新地址：请设置环境变量 VG_UPDATE_BASE_URL 或修改 src/main/lib/updater.ts')
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

  autoUpdater.on('error', (err) => {
    console.warn('[updater]', err?.message ?? err)
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
