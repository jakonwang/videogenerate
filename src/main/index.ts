import './lib/ipcGuardBootstrap'
import { app, BrowserWindow, ipcMain, dialog, protocol, Menu, Tray, nativeImage, screen, crashReporter } from 'electron'
import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { ensureAppDirs, getAppPaths } from './lib/paths'
import { getRecentSlowIpc } from './lib/ipcTiming'
import { canThumbnail, getThumbnail, normalizeThumbnailWidth } from './lib/mediaThumbnails'
import { backgroundRecordStore } from './lib/backgroundRecordStore'
import { gmvMaxWorkerClient } from './modules/tiktok-gmv-max/workerClient'
import { analyzeVideoFolderAndSuggestTemplate } from './modules/style/analyzeVideos'
import { normalizeAppLocale, type AppLocale } from '../shared/locale'
import { defaultOpenDialogTitle } from './lib/dialogDefaults'
import { registerUpdaterIpc, setupAutoUpdater } from './lib/updater'
import { initCloudLicense, maskManagedCredentialsForRenderer, overlayManagedCredentials, registerCloudLicenseIpc, registerManagedCredentialsBridge } from './lib/cloudLicense'
import { collectVideoFilesFromDropRoots } from './lib/collectVideoFiles'
import { listBundledLuts } from './lib/luts'
import { importUserFonts, listUserFontFiles, userFontsDir } from './lib/userFonts'
import {
  assessImportedFontFile,
  listBundledFontFiles,
  listRenderableAssFamilies,
} from './lib/fontResolve'
import { listBundledStickers, toStickerRef } from './lib/stickers'
import { importUserStickers, listUserStickerFiles, userStickersDir } from './lib/userStickers'
import { stopPreviewHttpServer } from './lib/previewHttpServer'
import { ensureWebApiServer, getWebApiServerPort, stopWebApiServer } from './lib/webApiServer'
import { cloneRepo } from './modules/clone/repo'
import { cloneService } from './modules/clone/service'
import { livePhotoService } from './modules/live-photo/service'
import { productsRepo } from './modules/products/repo'
import { templatesRepo } from './modules/templates/repo'
import { webPlatformRepo } from './modules/web-platform/repo'
import { configureWindowsStorageRoot, cleanupLegacyWindowsStorage, migrateLegacyWindowsUserData } from './lib/windowsStorage'
import { registerAppShellMediaIpc } from './ipc/registerAppShellMediaIpc'
import { registerLiveSlicerIpc } from './ipc/registerLiveSlicerIpc'
import { registerProductsIpc } from './ipc/registerProductsIpc'
import { registerCloneIpc } from './ipc/registerCloneIpc'
import { registerClonePromptTemplatesIpc } from './ipc/registerClonePromptTemplatesIpc'
import { registerLivePhotoIpc } from './ipc/registerLivePhotoIpc'
import { registerStyleReferenceIpc } from './ipc/registerStyleReferenceIpc'
import { registerProductImageMaterialsIpc } from './ipc/registerProductImageMaterialsIpc'
import { registerTiktokCreativeStudioIpc } from './ipc/registerTiktokCreativeStudioIpc'
import { registerTiktokListingIpc } from './ipc/registerTiktokListingIpc'
import { registerTemplatesTasksIpc } from './ipc/registerTemplatesTasksIpc'
import { registerVideoParserDownloadIpc } from './ipc/registerVideoParserDownloadIpc'
import { registerAgentOsIpc } from './ipc/registerAgentOsIpc'
import { registerContentHubIpc } from './ipc/registerContentHubIpc'
import { registerVideoWatermarkIpc } from './ipc/registerVideoWatermarkIpc'
import { registerStorageManagementIpc } from './ipc/registerStorageManagementIpc'
import { registerTiktokGmvMaxIpc } from './ipc/registerTiktokGmvMaxIpc'
import { registerDianxiaomiInventoryIpc } from './ipc/registerDianxiaomiInventoryIpc'
import { registerSellerInventoryIpc } from './ipc/registerSellerInventoryIpc'
import { registerTiktokCreatorHubIpc } from './ipc/registerTiktokCreatorHubIpc'
import { closeCreatorHubDb } from './modules/tiktok-creator-hub/repo'
import { registerProductWatermarkIpc } from './ipc/registerProductWatermarkIpc'
import { registerAssetLibraryIpc } from './ipc/registerAssetLibraryIpc'
import { registerMixPoolIpc, registerMixStudioIpc } from './ipc/registerMixPoolIpc'
import { registerProductReplacementIpc } from './ipc/registerProductReplacementIpc'
import { registerProductResearchIpc } from './ipc/registerProductResearchIpc'
import { registerCloudSyncIpc } from './ipc/registerCloudSyncIpc'
import { startCloudSync, stopCloudSync } from './modules/cloud-sync/service'
import { recordAllIpcHandlers, recordIpcHandlers, registerRelayHandler, startRelayWorker, stopRelayWorker } from './modules/cloud-sync/relayWorker'
import { defaultRelayMediaDeps, publishLocalMedia, type RelayMediaDeps } from './modules/cloud-sync/relayMedia'

let relayMediaDeps: Promise<RelayMediaDeps> | null = null
const getRelayMediaDeps = () => (relayMediaDeps ??= defaultRelayMediaDeps())
import { productReplacementService } from './modules/product-replacement/service'
import { agentOsService } from './modules/agent-os/service'
import { productImageMaterialsService } from './modules/product-image-materials/service'
import { productImageMaterialsRepo } from './modules/product-image-materials/repo'
import { tiktokListingRepo } from './modules/tiktok-listing/repo'
import { tiktokCreativeStudioRepo } from './modules/tiktok-creative-studio/repo'
import { tiktokCreativeStudioService } from './modules/tiktok-creative-studio/service'
import { closeTiktokOfficialBrowser } from './modules/tiktok-creative-studio/officialClient'
import { livePhotoRepo } from './modules/live-photo/repo'
import { videoParserDownloadService } from './modules/video-parser-download/service'
import { extractLegacyCapabilityPlatform, mapPlatformToStoredProvider, normalizeCapabilityProfileState } from '../shared/platformSettings'
import { gmvMaxScheduler } from './modules/tiktok-gmv-max/scheduler'
import { gmvMaxMcpClient } from './modules/tiktok-gmv-max/mcpClient'
import { closeGmvMaxSqlite } from './modules/tiktok-gmv-max/sqlite'
import { productResearchService } from './modules/product-research/service'

// Keep fatal startup errors available before Electron app paths are initialized.
const earlyDiagnosticPath = join(process.env.TEMP || process.cwd(), 'VideoGenerate-startup.log')
function writeEarlyDiagnostic(event: string, error: unknown) {
  try {
    const value = error instanceof Error ? `${error.stack || error.message}` : String(error)
    require('node:fs').appendFileSync(
      earlyDiagnosticPath,
      `[${new Date().toISOString()}] ${event}: ${value}\n`,
      'utf8',
    )
  } catch {
    // Diagnostics must never interfere with application startup.
  }
}

process.on('uncaughtException', (error) => writeEarlyDiagnostic('uncaughtException', error))
process.on('unhandledRejection', (reason) => writeEarlyDiagnostic('unhandledRejection', reason))

let mainWindow: BrowserWindow | null = null
let restoreConsoleBridge: (() => void) | null = null
let appTray: Tray | null = null
let isAppQuitting = false
let pendingWindowReveal = false
let rendererRecoveryTimestamps: number[] = []
const appStartupStartedAt = performance.now()
const RENDERER_RECOVERY_WINDOW_MS = 60_000
const MAX_RENDERER_RECOVERIES = 2
const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 })
let eventLoopMonitorTimer: NodeJS.Timeout | null = null
let lastEventLoopWarningAt = 0

function startEventLoopMonitoring() {
  if (eventLoopMonitorTimer) return
  eventLoopDelay.enable()
  eventLoopMonitorTimer = setInterval(() => {
    const maxDelayMs = eventLoopDelay.max / 1_000_000
    const meanDelayMs = eventLoopDelay.mean / 1_000_000
    eventLoopDelay.reset()
    if (maxDelayMs < 250 || Date.now() - lastEventLoopWarningAt < 30_000) return
    lastEventLoopWarningAt = Date.now()
    const memory = process.memoryUsage()
    const details = {
      maxDelayMs: Math.round(maxDelayMs),
      meanDelayMs: Math.round(meanDelayMs),
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      url: mainWindow?.webContents.getURL() || '',
      recentSlowIpc: getRecentSlowIpc(),
    }
    console.warn('[performance] main event loop delayed', details)
    void persistRendererDiagnostic('main-event-loop-delay', details)
  }, 5_000)
  eventLoopMonitorTimer.unref()
}

function stopEventLoopMonitoring() {
  if (eventLoopMonitorTimer) clearInterval(eventLoopMonitorTimer)
  eventLoopMonitorTimer = null
  eventLoopDelay.disable()
}

function markStartupStage(stage: string, details: Record<string, unknown> = {}) {
  console.log('[startup-performance]', {
    stage,
    elapsedMs: Math.round(performance.now() - appStartupStartedAt),
    ...details,
  })
}

async function persistRendererDiagnostic(event: string, details: Record<string, unknown> = {}) {
  try {
    const diagnosticsDir = join(getAppPaths().dataDir, 'diagnostics')
    await mkdir(diagnosticsDir, { recursive: true })
    const metrics = app.getAppMetrics().map((metric) => ({
      pid: metric.pid,
      type: metric.type,
      cpuPercent: metric.cpu.percentCPUUsage,
      workingSetSizeKb: metric.memory.workingSetSize,
      peakWorkingSetSizeKb: metric.memory.peakWorkingSetSize,
      privateBytesKb: metric.memory.privateBytes,
    }))
    const recordedAt = new Date().toISOString()
    const payload = JSON.stringify({ recordedAt, event, details, metrics }, null, 2)
    await Promise.all([
      writeFile(join(diagnosticsDir, 'renderer-latest.json'), payload, 'utf8'),
      writeFile(
        join(diagnosticsDir, `renderer-${Date.now()}.json`),
        payload,
        'utf8',
      ),
    ])
  } catch (error) {
    console.error('[window] failed to persist renderer diagnostic', error)
  }
}

function recoverRendererAfterCrash(details: Electron.RenderProcessGoneDetails) {
  if (isAppQuitting || !mainWindow || mainWindow.isDestroyed()) return
  if (details.reason === 'clean-exit' || details.reason === 'killed') return

  const now = Date.now()
  rendererRecoveryTimestamps = rendererRecoveryTimestamps.filter(
    (timestamp) => now - timestamp < RENDERER_RECOVERY_WINDOW_MS,
  )
  if (rendererRecoveryTimestamps.length >= MAX_RENDERER_RECOVERIES) {
    console.error('[window] renderer recovery limit reached')
    return
  }

  rendererRecoveryTimestamps.push(now)
  const crashedWindow = mainWindow
  const recoveryUrl = crashedWindow.webContents.getURL()
  setTimeout(() => {
    if (isAppQuitting || mainWindow !== crashedWindow) return
    console.warn('[window] recreating renderer after crash')
    crashedWindow.destroy()
    mainWindow = null
    createWindow(recoveryUrl)
  }, 750)
}

function loadRendererContent(window: BrowserWindow, initialUrl = '') {
  if (initialUrl) return window.loadURL(initialUrl)
  const devUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL
  return devUrl
    ? window.loadURL(devUrl)
    : window.loadFile(join(getAppPaths().rendererDist, 'index.html'))
}

function createTrayIcon() {
  const candidates = [
    join(process.cwd(), 'resources', 'icon-brand-green.png'),
    join(process.cwd(), 'resources', 'icon-brand.png'),
    join(process.resourcesPath, 'icon-brand.png'),
  ]
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue
    const icon = nativeImage.createFromPath(filePath)
    if (!icon.isEmpty()) return icon.resize({ width: 16, height: 16 })
  }
  return nativeImage.createEmpty()
}

function ignoreBrokenPipeOnStdStreams() {
  const swallowBrokenPipe = (error: unknown) => {
    const code = String((error as any)?.code ?? '')
    const message = String((error as any)?.message ?? error ?? '')
    if (code === 'EPIPE' || /broken pipe/i.test(message)) return
    throw error
  }
  process.stdout?.on?.('error', swallowBrokenPipe)
  process.stderr?.on?.('error', swallowBrokenPipe)
}

configureWindowsStorageRoot()
ignoreBrokenPipeOnStdStreams()
if (process.platform === 'win32') {
  const softwareRenderingRequested = process.env.VIDEOGENERATE_SOFTWARE_RENDERING === '1'
    || process.argv.includes('--software-rendering')
  if (softwareRenderingRequested) {
    app.disableHardwareAcceleration()
    app.commandLine.appendSwitch('disable-gpu')
    app.commandLine.appendSwitch('disable-gpu-compositing')
    app.commandLine.appendSwitch('in-process-gpu')
  }
  // The packaged app runs in environments where Chromium's sandbox broker
  // cannot create a renderer process (exit code 49). Disable it on Windows so
  // the renderer can start consistently.
  app.commandLine.appendSwitch('no-sandbox')
}
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()
const { cacheDir: electronCacheDir } = getAppPaths()
app.commandLine.appendSwitch('disk-cache-dir', electronCacheDir)
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

/** 与渲染进程语言同步，供未传 title 的系统对话框默认文案；`app.whenReady` 后再对齐系统 locale */
let mainUiLocale: AppLocale = 'zh-CN'

// 让渲染进程通过安全协议读取本地媒体（解决 file:// 播放受限问题）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vg',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
])

function guessMimeByPath(p: string) {
  const s = p.toLowerCase()
  if (s.endsWith('.png')) return 'image/png'
  if (s.endsWith('.jpg') || s.endsWith('.jpeg')) return 'image/jpeg'
  if (s.endsWith('.webp')) return 'image/webp'
  if (s.endsWith('.gif')) return 'image/gif'
  if (s.endsWith('.bmp')) return 'image/bmp'
  if (s.endsWith('.svg')) return 'image/svg+xml'
  if (s.endsWith('.mp4')) return 'video/mp4'
  if (s.endsWith('.mov')) return 'video/quicktime'
  if (s.endsWith('.webm')) return 'video/webm'
  if (s.endsWith('.mkv')) return 'video/x-matroska'
  return 'application/octet-stream'
}

async function wireMediaProtocol() {
  protocol.handle('vg', async (request) => {
    try {
      const u = new URL(request.url)
      if (u.hostname !== 'file') return new Response('not found', { status: 404 })
      const filePath = u.searchParams.get('path') ?? ''
      if (!filePath) return new Response('bad request', { status: 400 })
      const fileStat = await stat(filePath)
      const size = fileStat.size
      const range = request.headers.get('range')
      const mime = guessMimeByPath(filePath)

      // `&w=` asks for a downscaled, disk-cached thumbnail (see mediaThumbnails.ts).
      const thumbWidth = normalizeThumbnailWidth(u.searchParams.get('w'))
      if (thumbWidth && !range && canThumbnail(filePath)) {
        const thumbnail = await getThumbnail(filePath, thumbWidth, fileStat.mtimeMs, size)
        if (thumbnail) {
          return new Response(new Uint8Array(thumbnail), {
            status: 200,
            headers: {
              'Content-Length': String(thumbnail.length),
              'Content-Type': 'image/webp',
            },
          })
        }
      }

      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim())
        if (!match) {
          return new Response('range not satisfiable', {
            status: 416,
            headers: { 'Content-Range': `bytes */${size}` },
          })
        }
        const requestedStart = match[1] ? Number(match[1]) : 0
        const requestedEnd = match[2] ? Number(match[2]) : size - 1
        const start = Math.max(0, Math.min(requestedStart, size - 1))
        const end = Math.max(start, Math.min(requestedEnd, size - 1))
        const chunkSize = end - start + 1
        const stream = createReadStream(filePath, { start, end })
        const webStream = Readable.toWeb(stream) as any
        return new Response(webStream, {
          status: 206,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Content-Type': mime,
          },
        })
      }

      const stream = createReadStream(filePath)
      const webStream = Readable.toWeb(stream) as any
      return new Response(webStream, {
        status: 200,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(size),
          'Content-Type': mime,
        },
      })
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}

function revealMainWindow() {
  if (!mainWindow) return
  let bounds = mainWindow.getBounds()
  if (bounds.width < 640 || bounds.height < 480) {
    const display = screen.getDisplayMatching(bounds)
    const workArea = display?.workArea
    const width = Math.min(1080, workArea?.width || 1080)
    const height = Math.min(720, workArea?.height || 720)
    mainWindow.setBounds({
      x: workArea ? workArea.x + Math.max(0, Math.floor((workArea.width - width) / 2)) : 100,
      y: workArea ? workArea.y + Math.max(0, Math.floor((workArea.height - height) / 2)) : 100,
      width,
      height,
    })
    bounds = mainWindow.getBounds()
  }
  const display = screen.getDisplayMatching(bounds)
  const workArea = display?.workArea
  const isOffScreen =
    !workArea ||
    bounds.x + bounds.width < workArea.x ||
    bounds.y + bounds.height < workArea.y ||
    bounds.x > workArea.x + workArea.width ||
    bounds.y > workArea.y + workArea.height
  if (isOffScreen) {
    mainWindow.center()
  }
  mainWindow.setSkipTaskbar(false)
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.moveTop()
  mainWindow.focus()
}

// macOS：关窗后程序留在托盘 / Dock，点 Dock 图标要能把窗口找回来
app.on('activate', () => {
  pendingWindowReveal = true
  revealMainWindow()
})

app.on('second-instance', () => {
  // The first instance may still be initializing its BrowserWindow when the
  // second launch arrives. Defer the reveal instead of dropping the request.
  pendingWindowReveal = true
  revealMainWindow()
})

function hideMainWindowToTray() {
  if (!mainWindow) return
  mainWindow.hide()
  mainWindow.setSkipTaskbar(true)
}

function ensureTray() {
  if (appTray) return appTray
  const trayIcon = createTrayIcon()
  appTray = new Tray(trayIcon)
  appTray.setToolTip(app.getName())
  appTray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => revealMainWindow(),
      },
      {
        label: '退出',
        click: () => {
          isAppQuitting = true
          app.quit()
        },
      },
    ]),
  )
  appTray.on('double-click', () => revealMainWindow())
  appTray.on('click', () => revealMainWindow())
  return appTray
}

function setupCloneDebugConsoleBridge() {
  if (restoreConsoleBridge) return
  const originalConsoleLog = console.log.bind(console)
  console.log = (...args: unknown[]) => {
    originalConsoleLog(...args)
    try {
      const first = String(args[0] ?? '')
      if (!first.includes('[clone-debug]') && !first.includes('[vectorengine-debug]') && !first.includes('[web-platform-debug]')) {
        return
      }
      mainWindow?.webContents.send('clone:runtimeLog', {
        level: 'info',
        message: args
          .map((item) => {
            if (typeof item === 'string') return item
            try {
              return JSON.stringify(item)
            } catch {
              return String(item)
            }
          })
          .join(' '),
        time: Date.now(),
      })
    } catch {
      // ignore bridge errors
    }
  }
  restoreConsoleBridge = () => {
    console.log = originalConsoleLog
    restoreConsoleBridge = null
  }
}

function createWindow(initialUrl = '') {
  const { preload } = getAppPaths()
  ensureTray()
  const iconCandidates = [
    join(process.cwd(), 'resources', 'icon-brand-green.png'),
    join(process.cwd(), 'resources', 'icon-brand.png'),
    join(process.resourcesPath, 'icon-brand.png'),
  ]
  const windowIcon = iconCandidates
    .map((filePath) => (existsSync(filePath) ? nativeImage.createFromPath(filePath) : nativeImage.createEmpty()))
    .find((icon) => !icon.isEmpty())
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    show: false,
    backgroundColor: '#070910',
    frame: false,
    titleBarStyle: 'hidden',
    ...(windowIcon && !windowIcon.isEmpty() ? { icon: windowIcon } : {}),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const createdWindow = mainWindow

  mainWindow.center()
  const revealFallbackTimer = setTimeout(() => {
    console.warn('[window] reveal fallback triggered')
    markStartupStage('window-reveal-fallback')
    revealMainWindow()
  }, 15000)
  mainWindow.once('ready-to-show', () => {
    markStartupStage('window-ready-to-show')
    revealMainWindow()
  })
  mainWindow.on('close', (event) => {
    if (isAppQuitting) return
    event.preventDefault()
    hideMainWindowToTray()
  })
  mainWindow.on('closed', () => {
    clearTimeout(revealFallbackTimer)
    if (mainWindow === createdWindow) mainWindow = null
  })
  mainWindow.webContents.on('did-finish-load', () => {
    clearTimeout(revealFallbackTimer)
    markStartupStage('renderer-loaded')
    revealMainWindow()
  })
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    clearTimeout(revealFallbackTimer)
    console.error('[window] failed to load renderer', {
      errorCode,
      errorDescription,
      validatedURL,
    })
    revealMainWindow()
  })
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log('[renderer-console]', { level, message, line, sourceId })
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    clearTimeout(revealFallbackTimer)
    console.error('[window] render-process-gone', details)
    void persistRendererDiagnostic('render-process-gone', { ...details })
    revealMainWindow()
    recoverRendererAfterCrash(details)
  })
  mainWindow.webContents.on('unresponsive', () => {
    clearTimeout(revealFallbackTimer)
    console.error('[window] renderer unresponsive')
    void persistRendererDiagnostic('renderer-unresponsive')
    revealMainWindow()
  })
  mainWindow.webContents.on('responsive', () => {
    console.info('[window] renderer responsive')
  })

  void loadRendererContent(mainWindow, initialUrl)
  markStartupStage('window-created')
  if (pendingWindowReveal) {
    pendingWindowReveal = false
    revealMainWindow()
  }
}

function wireIpc() {
  setupCloneDebugConsoleBridge()

  // 电脑代办：记下所有 IPC 处理函数（网页能调用哪些由 RELAY_MODULES 决定）
  recordAllIpcHandlers(ipcMain)
  registerRelayHandler('relayMedia:publish', async (_event, input) => publishLocalMedia(await getRelayMediaDeps(), input as { path?: string; width?: number }))
  ipcMain.handle('app:getPaths', async () => getAppPaths())
  ipcMain.handle('app:getWebApiInfo', async () => ({
    port: getWebApiServerPort(),
    baseUrl: getWebApiServerPort() ? `http://127.0.0.1:${getWebApiServerPort()}` : '',
  }))

  ipcMain.handle('app:setUiLocale', async (_e, locale: string) => {
    mainUiLocale = normalizeAppLocale(locale)
    return { ok: true, locale: mainUiLocale }
  })
  ipcMain.handle('app:getUiLocale', async () => mainUiLocale)

  ipcMain.handle('window:minimize', async () => {
    mainWindow?.minimize()
    return { ok: true }
  })
  ipcMain.handle('window:maximizeToggle', async () => {
    if (!mainWindow) return { ok: false }
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return { ok: true, maximized: mainWindow.isMaximized() }
  })
  ipcMain.handle('window:close', async () => {
    mainWindow?.close()
    return { ok: true }
  })
  ipcMain.handle('window:isMaximized', async () => {
    return { maximized: Boolean(mainWindow?.isMaximized()) }
  })

  ipcMain.handle(
    'fs:pickFiles',
    async (_e, opts: { title?: string; filters?: Electron.FileFilter[]; multiple?: boolean }) => {
      const res = await dialog.showOpenDialog({
        title: opts?.title ?? defaultOpenDialogTitle(mainUiLocale, 'pickFiles'),
        properties: opts?.multiple === false ? ['openFile'] : ['openFile', 'multiSelections'],
        filters: opts?.filters,
      })
      if (res.canceled) return []
      return res.filePaths
    },
  )

  ipcMain.handle('fs:pickDir', async (_e, opts: { title?: string }) => {
    const res = await dialog.showOpenDialog({
      title: opts?.title ?? defaultOpenDialogTitle(mainUiLocale, 'pickDir'),
      properties: ['openDirectory', 'createDirectory'],
    })
    if (res.canceled) return null
    return res.filePaths[0] ?? null
  })

  ipcMain.handle('fs:pathExists', async (_e, input: { path: string }) => {
    const targetPath = String(input?.path || '').trim()
    if (!targetPath) return false
    return existsSync(targetPath)
  })

  ipcMain.handle('fs:describeFiles', async (_e, paths: string[]) => {
    const uniquePaths = Array.from(new Set((Array.isArray(paths) ? paths : []).map((item) => String(item || '').trim()).filter(Boolean)))
    return await Promise.all(uniquePaths.map(async (targetPath) => {
      try {
        const details = await stat(targetPath)
        return {
          path: targetPath,
          exists: true,
          isFile: details.isFile(),
          size: details.size,
          modifiedAt: details.mtimeMs,
        }
      } catch {
        return { path: targetPath, exists: false, isFile: false, size: 0, modifiedAt: 0 }
      }
    }))
  })

  ipcMain.handle('fs:stageAttachment', async (_e, input: { name?: string; base64?: string }) => {
    const encoded = String(input?.base64 || '').trim()
    const maxBytes = 64 * 1024 * 1024
    if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('The attachment data is invalid.')
    if (encoded.length > Math.ceil(maxBytes / 3) * 4) throw new Error('The attachment exceeds the 64 MB clipboard limit.')
    const buffer = Buffer.from(encoded, 'base64')
    if (!buffer.length) throw new Error('The attachment is empty.')
    if (buffer.length > maxBytes) throw new Error('The attachment exceeds the 64 MB clipboard limit.')
    const requestedName = basename(String(input?.name || 'attachment.bin'))
    const safeName = requestedName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 160) || 'attachment.bin'
    const targetDir = join(getAppPaths().dataDir, 'attachments', 'inbox')
    await mkdir(targetDir, { recursive: true })
    const targetPath = join(targetDir, `${Date.now()}-${randomUUID()}-${safeName}`)
    await writeFile(targetPath, buffer)
    return { path: targetPath, name: safeName, size: buffer.length }
  })

  ipcMain.handle('fs:collectVideoFilesFromDrop', async (_e, roots: string[]) => {
    return await collectVideoFilesFromDropRoots(Array.isArray(roots) ? roots.map((x) => String(x)) : [])
  })

  ipcMain.handle('fs:readFileAsBase64', async (_e, input: { path: string }) => {
    const targetPath = String(input?.path || '').trim()
    if (!targetPath) throw new Error('文件路径不能为空')
    const buffer = await readFile(targetPath)
    return buffer.toString('base64')
  })

  ipcMain.handle('luts:list', async () => {
    return listBundledLuts().map((x) => ({ fileName: x.fileName, displayName: x.displayName }))
  })

  ipcMain.handle('stickers:list', async () => {
    const bundled = listBundledStickers().map((x) => ({
      ref: toStickerRef('bundled', x.fileName),
      fileName: x.fileName,
      displayName: x.displayName,
      scope: 'bundled' as const,
    }))
    const user = (await listUserStickerFiles()).map((x) => ({
      ref: toStickerRef('user', x.fileName),
      fileName: x.fileName,
      displayName: x.fileName.replace(/\.(png|webp)$/i, ''),
      scope: 'user' as const,
    }))
    return [...bundled, ...user]
  })

  ipcMain.handle('stickers:listUser', async () => {
    const files = await listUserStickerFiles()
    return { dir: userStickersDir(), files: files.map((x) => x.fileName) }
  })

  ipcMain.handle('stickers:import', async (_e, paths: string[]) => {
    return await importUserStickers(Array.isArray(paths) ? paths.map((x) => String(x)) : [])
  })

  ipcMain.handle('fonts:listUser', async () => {
    const files = await listUserFontFiles()
    const enriched = await Promise.all(files.map((x) => assessImportedFontFile({ fileName: x.fileName, absPath: x.absPath })))
    return { dir: userFontsDir(), files: files.map((x) => x.fileName), fonts: enriched }
  })

  ipcMain.handle('fonts:list', async () => {
    const bundled = await listBundledFontFiles()
    const user = await listUserFontFiles()
    const bundledFonts = await Promise.all(
      (bundled.files ?? []).map(async (fileName) => {
        const absPath = bundled.dir ? join(bundled.dir, fileName) : ''
        return assessImportedFontFile({ fileName, absPath })
      }),
    )
    const userFonts = await Promise.all(
      user.map((x) => assessImportedFontFile({ fileName: x.fileName, absPath: x.absPath })),
    )
    const bundledRenderable = bundled.dir ? await listRenderableAssFamilies(bundled.dir) : []
    const userRenderable = await listRenderableAssFamilies(userFontsDir())
    const familySet = new Set<string>()
    const renderableFamilies = [...bundledRenderable, ...userRenderable].filter((x) => {
      const key = String(x.familyName ?? '').trim().toLowerCase()
      if (!key || familySet.has(key)) return false
      familySet.add(key)
      return true
    })
    return {
      bundledDir: bundled.dir ?? '',
      bundledFiles: bundled.files ?? [],
      userDir: userFontsDir(),
      userFiles: user.map((x) => x.fileName),
      bundledFonts,
      userFonts,
      renderableFamilies,
    }
  })

  ipcMain.handle('fonts:import', async (_e, paths: string[]) => {
    const res = await importUserFonts(Array.isArray(paths) ? paths.map((x) => String(x)) : [])
    // 导入后立即评估可用性，便于 UI 展示与自动回填
    try {
      const all = await listUserFontFiles()
      const importedSet = new Set((res.imported ?? []).map((x) => String(x)))
      const imported = await Promise.all(
        all
          .filter((x) => importedSet.has(x.fileName))
          .map((x) => assessImportedFontFile({ fileName: x.fileName, absPath: x.absPath })),
      )
      return { imported: (res.imported ?? []), fonts: imported }
    } catch {
      return { imported: res.imported ?? [], fonts: [] as Array<{ fileName: string; familyName: string; renderReady: boolean; message: string }> }
    }
  })

  ipcMain.handle('style:analyzeVideos', async (_e, payload: { dir?: string }) => {
    return await analyzeVideoFolderAndSuggestTemplate({
      dir: String(payload?.dir ?? '').trim(),
    })
  })

  registerCloneIpc(recordIpcHandlers(ipcMain))
  // Also served to the web 设置 → 模型与 AI through the live relay (managed keys stay masked).
  recordIpcHandlers(ipcMain).handle('clone:getModelCredentials', async () => {
    // 后台统一下发密钥时，渲染进程只能看到掩码
    return maskManagedCredentialsForRenderer(await cloneService.getModelCredentials())
  })
  const saveModelCredentialsPayload = async (
      payload: {
        seedanceApiKey?: string
        seedanceHost?: string
        grsaiApiKey?: string
        grsaiHost?: string
        tikhubApiKey?: string
        qiniuAccessKey?: string
        qiniuSecretKey?: string
        qiniuBucket?: string
        qiniuDomain?: string
        qiniuUploadHost?: string
        qiniuPrefix?: string
        allowMockWhenNoKey?: boolean
        keyframeModel?: string
        videoModelPrimary?: string
        videoModelFallback?: string
        grsaiVideoModel?: string
        grsaiAnalysisModel?: string
        chatProviderPrimary?: 'apifox_hub' | 'grsai'
        videoProviderPrimary?: 'seedance' | 'kling' | 'grsai' | 'apifox_hub'
        videoProviderFallback?: 'seedance' | 'kling' | 'grsai' | 'apifox_hub'
        openaiApiKey?: string
        openaiImageModel?: string
        openaiImageQuality?: 'low' | 'medium' | 'high'
        imageProviderPrimary?: 'openai' | 'kling' | 'grsai' | 'apifox_hub'
        grsaiImageModel?: string
        apifoxHubProfile?: 'ai666' | 'vectorengine' | 'xibapi' | 'gaorui'
        videoApifoxHubProfile?: 'ai666' | 'vectorengine' | 'xibapi' | 'gaorui'
        imageApifoxHubProfile?: 'ai666' | 'vectorengine'
        chatApifoxHubProfile?: 'ai666' | 'vectorengine'
        ai666Hub?: import('./modules/clone/types').ApifoxHubCredentials
        vectorEngineHub?: import('./modules/clone/types').ApifoxHubCredentials
        xibapiHub?: import('./modules/clone/types').ApifoxHubCredentials
        gaoruiHub?: import('./modules/clone/types').ApifoxHubCredentials
        apifoxHub?: import('./modules/clone/types').ApifoxHubCredentials
      },
    ) => {
      const normalizedProfiles = normalizeCapabilityProfileState({
        apifoxHubProfile: payload?.apifoxHubProfile,
        videoApifoxHubProfile: payload?.videoApifoxHubProfile,
        imageApifoxHubProfile: payload?.imageApifoxHubProfile,
        chatApifoxHubProfile: payload?.chatApifoxHubProfile,
        videoProviderPrimary: payload?.videoProviderPrimary,
        videoProviderFallback: payload?.videoProviderFallback,
        imageProviderPrimary: payload?.imageProviderPrimary,
        chatProviderPrimary: payload?.chatProviderPrimary,
      })
      const hasLegacyVideoProfile = Boolean(extractLegacyCapabilityPlatform('video', payload?.videoProviderPrimary, payload?.videoProviderFallback))
      const hasLegacyImageProfile = Boolean(extractLegacyCapabilityPlatform('image', payload?.imageProviderPrimary))
      const hasLegacyChatProfile = Boolean(extractLegacyCapabilityPlatform('chat', payload?.chatProviderPrimary))
      const normalizedVideoProviderPrimary =
        hasLegacyVideoProfile
          ? (mapPlatformToStoredProvider(normalizedProfiles.videoApifoxHubProfile).provider as 'grsai' | 'apifox_hub')
          : payload?.videoProviderPrimary
      const normalizedVideoProviderFallback =
        hasLegacyVideoProfile
          ? (mapPlatformToStoredProvider(normalizedProfiles.videoApifoxHubProfile).provider as 'grsai' | 'apifox_hub')
          : payload?.videoProviderFallback
      const normalizedImageProviderPrimary =
        hasLegacyImageProfile
          ? (mapPlatformToStoredProvider(normalizedProfiles.imageApifoxHubProfile).provider as 'grsai' | 'apifox_hub')
          : payload?.imageProviderPrimary
      const normalizedChatProviderPrimary =
        hasLegacyChatProfile
          ? (mapPlatformToStoredProvider(normalizedProfiles.chatApifoxHubProfile).provider as 'grsai' | 'apifox_hub')
          : payload?.chatProviderPrimary
      return await cloneService.setModelCredentials({
        seedanceApiKey: payload?.seedanceApiKey,
        seedanceHost: payload?.seedanceHost,
        grsaiApiKey: payload?.grsaiApiKey,
        grsaiHost: payload?.grsaiHost,
        tikhubApiKey: payload?.tikhubApiKey,
        qiniuAccessKey: payload?.qiniuAccessKey,
        qiniuSecretKey: payload?.qiniuSecretKey,
        qiniuBucket: payload?.qiniuBucket,
        qiniuDomain: payload?.qiniuDomain,
        qiniuUploadHost: payload?.qiniuUploadHost,
        qiniuPrefix: payload?.qiniuPrefix,
        allowMockWhenNoKey: Boolean(payload?.allowMockWhenNoKey ?? false),
        keyframeModel: payload?.keyframeModel,
        videoModelPrimary: payload?.videoModelPrimary,
        videoModelFallback: payload?.videoModelFallback,
        grsaiVideoModel: payload?.grsaiVideoModel,
        grsaiAnalysisModel: payload?.grsaiAnalysisModel,
        chatProviderPrimary: normalizedChatProviderPrimary,
        videoProviderPrimary: normalizedVideoProviderPrimary,
        videoProviderFallback: normalizedVideoProviderFallback,
        openaiApiKey: payload?.openaiApiKey,
        openaiImageModel: payload?.openaiImageModel,
        openaiImageQuality: payload?.openaiImageQuality,
        imageProviderPrimary: normalizedImageProviderPrimary,
        grsaiImageModel: payload?.grsaiImageModel,
        apifoxHubProfile: normalizedProfiles.apifoxHubProfile,
        videoApifoxHubProfile: normalizedProfiles.videoApifoxHubProfile,
        imageApifoxHubProfile: normalizedProfiles.imageApifoxHubProfile,
        chatApifoxHubProfile: normalizedProfiles.chatApifoxHubProfile,
        ai666Hub: payload?.ai666Hub,
        vectorEngineHub: payload?.vectorEngineHub,
        xibapiHub: payload?.xibapiHub,
        gaoruiHub: payload?.gaoruiHub,
        apifoxHub: payload?.apifoxHub,
      })
    }
  registerManagedCredentialsBridge({
    load: () => cloneService.getModelCredentials() as Promise<Record<string, unknown>>,
    save: (payload) => saveModelCredentialsPayload(payload as Parameters<typeof saveModelCredentialsPayload>[0]),
  })
  recordIpcHandlers(ipcMain).handle('clone:setModelCredentials', async (_e, payload: Parameters<typeof saveModelCredentialsPayload>[0]) => {
    // 托管模式下：用户改的其它字段照常保存，后台负责的字段始终以后台为准
    return await saveModelCredentialsPayload(overlayManagedCredentials(payload as Record<string, unknown>) as Parameters<typeof saveModelCredentialsPayload>[0])
  })
  ipcMain.handle(
    'clone:setRuntimeOptions',
    async (
      _e,
      payload: {
        storyboardFrameConcurrency?: number
        globalStoryboardFrameConcurrency?: number
      },
    ) => {
      return await cloneService.setRuntimeOptions({
        storyboardFrameConcurrency: payload?.storyboardFrameConcurrency,
        globalStoryboardFrameConcurrency: payload?.globalStoryboardFrameConcurrency,
      })
    },
  )
  ipcMain.handle('clone:getGrsAiCredits', async () => {
    return await cloneService.getGrsAiCredits()
  })

  registerAppShellMediaIpc(ipcMain, () => mainWindow, () => mainUiLocale)
  registerLiveSlicerIpc(ipcMain)
  registerProductsIpc(recordIpcHandlers(ipcMain))
  registerClonePromptTemplatesIpc(ipcMain)
  registerLivePhotoIpc(ipcMain)
  registerStyleReferenceIpc(ipcMain)
  registerProductImageMaterialsIpc(ipcMain)
  registerTiktokCreativeStudioIpc(recordIpcHandlers(ipcMain), () => mainWindow)
  registerTiktokListingIpc(ipcMain)
  registerTemplatesTasksIpc(ipcMain, () => mainWindow)
  registerMixPoolIpc(ipcMain, () => mainWindow)
  registerMixStudioIpc(recordIpcHandlers(ipcMain))
  registerVideoParserDownloadIpc(ipcMain)
  registerAgentOsIpc(ipcMain, () => mainWindow)
  registerContentHubIpc(recordIpcHandlers(ipcMain), () => mainWindow)
  void import('./modules/clone/crossLineShots').then(({ startCloneShotBackfillWatcher }) => startCloneShotBackfillWatcher()).catch((error) => console.warn('[clone] shot backfill watcher failed to start', error))
  registerVideoWatermarkIpc(ipcMain, () => mainWindow)
  registerStorageManagementIpc(ipcMain)
  // 网页版的 GMV Max / 达人中心页面通过云端实时转交到这台电脑执行（cloud-sync/relayWorker）
  registerTiktokGmvMaxIpc(recordIpcHandlers(ipcMain))
  registerDianxiaomiInventoryIpc(recordIpcHandlers(ipcMain), () => mainWindow)
  registerSellerInventoryIpc(recordIpcHandlers(ipcMain))
  registerTiktokCreatorHubIpc(recordIpcHandlers(ipcMain))
  registerProductWatermarkIpc(ipcMain)
  registerAssetLibraryIpc(ipcMain)
  registerProductReplacementIpc(ipcMain)
  registerProductResearchIpc(ipcMain)
  registerCloudSyncIpc(ipcMain)
  void productReplacementService.recoverOnStartup()
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return
  markStartupStage('app-ready')
  mainUiLocale = normalizeAppLocale(app.getLocale())
  await migrateLegacyWindowsUserData()
  markStartupStage('legacy-storage-migrated')
  await ensureAppDirs()
  markStartupStage('app-directories-ready')
  const crashDumpsDir = join(getAppPaths().dataDir, 'crashDumps')
  await mkdir(crashDumpsDir, { recursive: true })
  app.setPath('crashDumps', crashDumpsDir)
  registerCloudLicenseIpc()
  await initCloudLicense()
  markStartupStage('cloud-license-ready')
  // Keep startup paths ready before renderer IPC requests begin.
  wireIpc()
  void productResearchService.ensureServer().catch((error) => {
    console.error('[product-research] startup failed', error)
  })
  // 商品库、模特库与手机 App 经云端同步（未登录时自动跳过）
  startCloudSync()
  startRelayWorker()
  await wireMediaProtocol()
  createWindow()
  markStartupStage('window-created')
  try {
    crashReporter.start({
        productName: 'Klipmill',
      companyName: 'Klipmill',
      submitURL: '',
      uploadToServer: false,
      compress: false,
    })
  } catch (error) {
    console.warn('[startup] crash reporter unavailable', error)
  }
  registerUpdaterIpc(() => mainWindow)
  setupAutoUpdater(() => mainWindow)
  startEventLoopMonitoring()

  setTimeout(() => {
    void (async () => {
      markStartupStage('background-initialization-start')
      try {
        await cleanupLegacyWindowsStorage()
        await agentOsService.initialize()
        await productsRepo.ensureSeed()
        const productImageMigration = await productsRepo.migrateExternalImages()
        if (productImageMigration.migrated || productImageMigration.missing) {
          console.log('[products] external-image-migration', productImageMigration)
        }
        await templatesRepo.ensureSeed()
        await cloneRepo.ensureSeed()
        await webPlatformRepo.ensureSeed()
        // Run large asset migrations in slices so startup work does not saturate disk I/O at once.
        const managedAssetMigrations: Array<{ migrated: number }> = []
        const migrationSteps = [
          () => templatesRepo.migrateExternalAssets(),
          () => cloneRepo.migrateExternalAssets(),
          () => webPlatformRepo.migrateBatchSubtitleExternalAssets(),
          () => productImageMaterialsRepo.migrateExternalAssets(),
          () => tiktokListingRepo.migrateExternalAssets(),
          () => tiktokCreativeStudioRepo.migrateExternalAssets(),
          () => livePhotoRepo.migrateExternalAssets(),
        ]
        for (const migrate of migrationSteps) {
          managedAssetMigrations.push(await migrate())
          await new Promise<void>((resolve) => setImmediate(resolve))
        }
        const migratedManagedAssets = managedAssetMigrations.reduce((total, item) => total + item.migrated, 0)
        if (migratedManagedAssets) {
          console.log('[managed-assets] external-asset-migration', { migrated: migratedManagedAssets })
        }
        await videoParserDownloadService.initialize()
        await productImageMaterialsService.initialize()
        await ensureWebApiServer()
        await cloneService.resumePendingRemoteStoryboardVideosOnStartup()
        await livePhotoService.resumePendingTasksOnStartup()
        try {
          const resumedTiktokTasks = await tiktokCreativeStudioService.resumePending()
          markStartupStage('tiktok-creative-auto-resume-complete', resumedTiktokTasks)
        } catch (error) {
          console.error('[tiktok-creative] startup resume failed', error)
          markStartupStage('tiktok-creative-auto-resume-failed')
        }
        // Background synchronization must be started explicitly by the user.
        markStartupStage('background-initialization-complete')
      } catch (error: any) {
        console.error('[app-startup] bootstrap-failed', {
          message: String(error?.message ?? error ?? 'unknown error'),
          stack: String(error?.stack ?? ''),
        })
        if (!mainWindow || mainWindow.isDestroyed()) {
          dialog.showErrorBox(
            'Klipmill Startup Failed',
            String(error?.message ?? error ?? 'Unknown startup error'),
          )
        }
      }
    })()
  }, 150)
})

app.on('window-all-closed', () => {
  if (isAppQuitting && process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  isAppQuitting = true
  stopEventLoopMonitoring()
  void closeTiktokOfficialBrowser()
  void stopPreviewHttpServer()
  void stopWebApiServer()
  void productResearchService.stop()
  stopCloudSync()
  stopRelayWorker()
  gmvMaxScheduler.stop()
  void backgroundRecordStore.close()
  void gmvMaxWorkerClient.close()
  closeCreatorHubDb()
  void gmvMaxMcpClient.closeAll().finally(() => closeGmvMaxSqlite())
})
