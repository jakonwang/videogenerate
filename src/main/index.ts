import { app, BrowserWindow, ipcMain, dialog, protocol, Menu, Tray, nativeImage, screen } from 'electron'
import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { performance } from 'node:perf_hooks'
import { ensureAppDirs, getAppPaths } from './lib/paths'
import { analyzeVideoFolderAndSuggestTemplate } from './modules/style/analyzeVideos'
import { normalizeAppLocale, type AppLocale } from '../shared/locale'
import { defaultOpenDialogTitle } from './lib/dialogDefaults'
import { registerUpdaterIpc, setupAutoUpdater } from './lib/updater'
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
import { stopLocalLivePhotoQualityChecker } from './modules/live-photo/qualityChecker'
import { productsRepo } from './modules/products/repo'
import { templatesRepo } from './modules/templates/repo'
import { webPlatformRepo } from './modules/web-platform/repo'
import { configureWindowsStorageRoot, cleanupLegacyWindowsStorage, migrateLegacyWindowsUserData } from './lib/windowsStorage'
import { registerAppShellMediaIpc } from './ipc/registerAppShellMediaIpc'
import { registerProductsIpc } from './ipc/registerProductsIpc'
import { registerLivePhotoIpc } from './ipc/registerLivePhotoIpc'
import { registerHermesLivePhotoIpc } from './ipc/registerHermesLivePhotoIpc'
import { registerProductImageMaterialsIpc } from './ipc/registerProductImageMaterialsIpc'
import { registerTiktokCreativeStudioIpc } from './ipc/registerTiktokCreativeStudioIpc'
import { registerTiktokListingIpc } from './ipc/registerTiktokListingIpc'
import { registerTemplatesTasksIpc } from './ipc/registerTemplatesTasksIpc'
import { registerVideoParserDownloadIpc } from './ipc/registerVideoParserDownloadIpc'
import { registerAgentOsIpc } from './ipc/registerAgentOsIpc'
import { registerHermesAgentIpc } from './ipc/registerHermesAgentIpc'
import { registerStorageManagementIpc } from './ipc/registerStorageManagementIpc'
import { agentOsService } from './modules/agent-os/service'
import { hermesRuntime } from './modules/hermes/runtime'
import { hermesManagement } from './modules/hermes/management'
import { productImageMaterialsService } from './modules/product-image-materials/service'
import { productImageMaterialsRepo } from './modules/product-image-materials/repo'
import { tiktokListingRepo } from './modules/tiktok-listing/repo'
import { tiktokCreativeStudioRepo } from './modules/tiktok-creative-studio/repo'
import { tiktokCreativeStudioService } from './modules/tiktok-creative-studio/service'
import { livePhotoRepo } from './modules/live-photo/repo'
import { videoParserDownloadService } from './modules/video-parser-download/service'
import { extractLegacyCapabilityPlatform, mapPlatformToStoredProvider, normalizeCapabilityProfileState } from '../shared/platformSettings'

let mainWindow: BrowserWindow | null = null
let restoreConsoleBridge: (() => void) | null = null
let appTray: Tray | null = null
let isAppQuitting = false
const appStartupStartedAt = performance.now()

function markStartupStage(stage: string, details: Record<string, unknown> = {}) {
  console.log('[startup-performance]', {
    stage,
    elapsedMs: Math.round(performance.now() - appStartupStartedAt),
    ...details,
  })
}

function createTrayIcon() {
  const candidates = [
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
      const filePath = decodeURIComponent(u.searchParams.get('path') ?? '')
      if (!filePath) return new Response('bad request', { status: 400 })
      const fileStat = await stat(filePath)
      const size = fileStat.size
      const range = request.headers.get('range')
      const mime = guessMimeByPath(filePath)

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
  const bounds = mainWindow.getBounds()
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

function createWindow() {
  const { preload } = getAppPaths()
  ensureTray()
  const iconCandidates = [
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
    frame: false,
    titleBarStyle: 'hidden',
    ...(windowIcon && !windowIcon.isEmpty() ? { icon: windowIcon } : {}),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.center()
  const revealFallbackTimer = setTimeout(() => {
    console.warn('[window] reveal fallback triggered')
    markStartupStage('window-reveal-fallback')
    revealMainWindow()
  }, 4000)
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
    mainWindow = null
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
    revealMainWindow()
  })
  mainWindow.webContents.on('unresponsive', () => {
    clearTimeout(revealFallbackTimer)
    console.error('[window] renderer unresponsive')
    revealMainWindow()
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(join(getAppPaths().rendererDist, 'index.html'))
  }
  markStartupStage('window-created')
}

function wireIpc() {
  setupCloneDebugConsoleBridge()

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
    const targetDir = join(getAppPaths().dataDir, 'hermes', 'attachment-inbox')
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

  ipcMain.handle(
    'clone:debugLog',
    async (
      _e,
      payload: {
        message: string
        level?: 'info' | 'error'
      },
    ) => {
      const text = String(payload?.message || '').trim()
      if (text) {
        if (payload?.level === 'error') console.error(text)
        else console.log(text)
      }
      return { ok: true }
    },
  )

  ipcMain.handle(
    'clone:createDraftProject',
    async (
      _e,
      payload: {
        locale?: 'vi-VN' | 'zh-CN'
        strength?: 'structure'
        title?: string
        description?: string
        runMode?: 'auto' | 'manual'
      },
    ) => {
      return await cloneService.createDraftProject(payload)
    },
  )
  ipcMain.handle(
    'clone:createBlueprint',
    async (_e, payload: { videoPath: string; locale?: 'vi-VN' | 'zh-CN'; strength?: 'structure'; cloneProjectId?: string }) => {
      return await cloneService.createCloneBlueprintFromReference(payload)
    },
  )
  ipcMain.handle(
    'clone:analyzeReference',
    async (_e, payload: { videoPath: string; locale?: 'vi-VN' | 'zh-CN'; strength?: 'structure' }) => {
      return await cloneService.analyzeReference(payload)
    },
  )
  ipcMain.handle(
    'clone:expandCommercialPrompt',
    async (_e, payload: { cloneProjectId: string; prompt?: string; sceneHint?: string; styleHint?: string }) => {
      return await cloneService.expandCommercialPrompt(payload)
    },
  )
  ipcMain.handle(
    'clone:prepareMaterials',
    async (
      _e,
      payload: {
        cloneProjectId: string
        productType?: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
        productPoints?: string
        productReferenceImagePaths?: string[]
        generateModelPack?: boolean
        forceRegenerateModelPack?: boolean
      },
    ) => {
      return await cloneService.prepareCloneMaterials(payload)
    },
  )
  ipcMain.handle(
    'clone:saveProjectProductImages',
    async (
      _e,
      payload: {
        cloneProjectId: string
        productReferenceImagePaths?: string[]
      },
    ) => {
      return await cloneService.saveProjectProductImages(payload)
    },
  )
  ipcMain.handle(
    'clone:bindProjectProduct',
    async (
      _e,
      payload: {
        cloneProjectId: string
        productId: string
      },
    ) => {
      return await cloneService.bindProjectProduct(payload)
    },
  )
  ipcMain.handle(
    'clone:generateVariants',
    async (
      _e,
      payload: {
        cloneProjectId: string
        targetProductId?: string
        variantsPerShot?: number
      },
    ) => {
      return await cloneService.generateCloneVariants(payload)
    },
  )
  ipcMain.handle(
    'clone:generateScriptVariants',
    async (
      _e,
      payload: {
        cloneProjectId: string
        variantCount: number
      },
    ) => {
      return await cloneService.generateScriptVariantsForProject(payload)
    },
  )
  ipcMain.handle(
    'clone:selectScriptVariant',
    async (
      _e,
      payload: {
        cloneProjectId: string
        variantId: string
      },
    ) => {
      return await cloneService.selectScriptVariantForProject(payload)
    },
  )
  ipcMain.handle(
    'clone:generateStoryboardGrids',
    async (
      _e,
      payload: {
        cloneProjectId: string
        productReferenceImagePaths?: string[]
        selectedModelIdentityId?: string
      },
    ) => {
      console.log('[clone-debug] ipc:generateStoryboardGrids', payload)
      return await cloneService.generateStoryboardGridsForProject(payload)
    },
  )
  ipcMain.handle(
    'clone:generateShotVideosFromStoryboard',
    async (
      _e,
      payload: {
        cloneProjectId: string
        maxAutoRetryPerShot?: number
      },
    ) => {
      console.log('[clone-debug] ipc:generateShotVideosFromStoryboard', payload)
      return await cloneService.generateShotVideosFromStoryboardFrames(payload)
    },
  )
  ipcMain.handle(
    'clone:autoRunToStoryboardVideos',
    async (
      _e,
      payload: {
        cloneProjectId: string
        variantCount?: number
        selectedModelIdentityId?: string
        productReferenceImagePaths?: string[]
        autoBindModelPack?: boolean
      },
    ) => {
      console.log('[clone-debug] ipc:autoRunToStoryboardVideos', payload)
      return await cloneService.autoRunCloneToStoryboardVideos(payload)
    },
  )
  ipcMain.handle(
    'clone:replaceShotVideo',
    async (
      _e,
      payload: {
        cloneProjectId: string
        shotId: string
        videoPath: string
      },
    ) => {
      return await cloneService.replaceShotVideoForProject(payload)
    },
  )
  ipcMain.handle(
    'clone:composeCloneVideo',
    async (
      _e,
      payload: {
        cloneProjectId: string
        outputDir?: string
      },
    ) => {
      return await cloneService.composeCloneFinalVideo(payload)
    },
  )
  ipcMain.handle(
    'clone:forceDownloadShotVideoResult',
    async (
      _e,
      payload: {
        cloneProjectId: string
        shotId: string
      },
    ) => {
      return await cloneService.forceDownloadShotVideoResult(payload)
    },
  )
  ipcMain.handle(
    'clone:generatePreviewBatch',
    async (
      _e,
      payload: {
        cloneProjectId: string
        topN?: number
        onlyMissing?: boolean
        variantsPerShot?: number
        productReferenceImagePaths?: string[]
        targetProductId?: string
        previewFirst?: boolean
      },
    ) => {
      return await cloneService.generateClonePreviewAndBatch(payload)
    },
  )
  ipcMain.handle('clone:getClonePipelineStatus', async (_e, payload: { cloneProjectId: string }) => {
    return await cloneService.getClonePipelineStatus(payload)
  })
  ipcMain.handle('clone:getProject', async (_e, payload: { cloneProjectId: string }) => {
    return await cloneService.getProject(payload)
  })
  ipcMain.handle(
    'clone:updateProjectMeta',
    async (_e, payload: { cloneProjectId: string; title?: string; description?: string }) => {
      return await cloneService.updateProjectMeta(payload)
    },
  )
  ipcMain.handle(
    'clone:applySubtitleVideoToProject',
    async (
      _e,
      payload: { cloneProjectId: string; subtitleVideoPath: string; subtitleCoverImagePath?: string },
    ) => {
      return await cloneService.applySubtitleVideoToProject(payload)
    },
  )
  ipcMain.handle(
    'clone:generateSubtitleVideosForProjects',
    async (
      _e,
      payload: {
        name: string
        sourceItems: Array<{
          id: string
          sourceType: 'upload' | 'clone_final'
          sourceVideoPath: string
          sourceProjectId?: string
          sourceProjectTitle?: string
          fileName: string
          coverImagePath?: string
        }>
        subtitleMode?: 'static_title' | 'timed_caption' | 'hybrid'
        subtitleSource?: 'whisper_compatible' | 'manual'
        exportEngine?: 'capcut_mate' | 'ass_fallback'
        titleRenderMode?: 'overlay_image' | 'ass_text'
        titleConfig?: {
          strategy?: 'single_for_all' | 'random_pool'
          singleText?: string
          titlePool?: string[]
        }
        titleItems?: Array<{ sourceItemId: string; text: string; updatedAt: number }>
        overlayImageConfig?: {
          canvasWidth?: number
          canvasHeight?: number
          fontName?: string
          fontSize?: number
          fontColor?: string
          strokeColor?: string
          strokeWidth?: number
          shadowColor?: string
          shadowBlur?: number
          position?: 'top' | 'center' | 'bottom'
          safeMargin?: number
          textAlign?: 'left' | 'center' | 'right'
          maxLines?: number
          maxWidthRatio?: number
          lineGap?: number
          bottomMargin?: number
        }
        captionStyle?: {
          fontName?: string
          fontSize?: number
          fontColor?: string
          strokeColor?: string
          strokeWidth?: number
          shadowColor?: string
          shadowBlur?: number
          position?: 'top' | 'center' | 'bottom'
          safeMargin?: number
          textAlign?: 'left' | 'center' | 'right'
          maxLines?: number
          maxWidthRatio?: number
          lineGap?: number
          bottomMargin?: number
        }
        layoutPolicy?: {
          maxLines?: number
          maxWidthRatio?: number
          reflowStrategy?: 'balanced' | 'punctuation'
          avoidPosition?: 'auto' | 'top' | 'bottom'
        }
      },
    ) => {
      return await cloneService.generateSubtitleVideosForProjects(payload)
    },
  )
  ipcMain.handle(
    'clone:revertSubtitleVideoFromProject',
    async (_e, payload: { cloneProjectId: string }) => {
      return await cloneService.revertSubtitleVideoFromProject(payload)
    },
  )
  ipcMain.handle(
    'clone:updateProjectRenderHints',
    async (
      _e,
      payload: {
        cloneProjectId: string
        aspectRatio?: '9:16' | '16:9'
        resolution?: '720x1280' | '1280x720' | '1080x1920' | '1920x1080'
      },
    ) => {
      return await cloneService.updateProjectRenderHints(payload)
    },
  )
  ipcMain.handle('clone:listCloneGroups', async () => {
    return await cloneService.listCloneGroups()
  })
  ipcMain.handle('clone:createCloneGroup', async (_e, payload: { name: string }) => {
    return await cloneService.createCloneGroup(payload)
  })
  ipcMain.handle('clone:renameCloneGroup', async (_e, payload: { groupId: string; name: string }) => {
    return await cloneService.renameCloneGroup(payload)
  })
  ipcMain.handle('clone:removeCloneGroup', async (_e, payload: { groupId: string }) => {
    return await cloneService.removeCloneGroup(payload)
  })
  ipcMain.handle('clone:assignCloneProjectsToGroup', async (_e, payload: { cloneProjectIds: string[]; groupId?: string }) => {
    return await cloneService.assignCloneProjectsToGroup(payload)
  })
  ipcMain.handle(
    'clone:bindProjectReferenceVideo',
    async (_e, payload: { cloneProjectId: string; videoPath: string }) => {
      return await cloneService.bindProjectReferenceVideo(payload)
    },
  )
  ipcMain.handle('clone:getProjectSummary', async (_e, payload: { cloneProjectId: string }) => {
    return await cloneService.getProjectSummary(payload)
  })
  ipcMain.handle('clone:refreshProjectStatus', async (_e, payload: { cloneProjectId: string }) => {
    const project = await cloneService.getProject(payload)
    return {
      project,
      results: [],
    }
  })
  ipcMain.handle('clone:reconcileRemoteStoryboardVideos', async (_e, payload: { cloneProjectId: string }) => {
    return await cloneService.reconcileRemoteStoryboardVideos(payload)
  })
  ipcMain.handle('clone:reanalyzeShotScript', async (_e, payload: { cloneProjectId: string; shotId: string }) => {
    return await cloneService.reanalyzeShotScript(payload)
  })
  ipcMain.handle(
    'clone:generateShotVariants',
    async (
      _e,
      payload: {
        cloneProjectId: string
        shotIds?: string[]
        targetProductId?: string
        variantsPerShot?: number
        strategy?: 'balanced' | 'low_cost' | 'high_conversion' | 'anti_duplicate'
      },
    ) => cloneService.generateShotVariants(payload),
  )
  ipcMain.handle(
    'clone:scoreShotVariants',
    async (_e, payload: { cloneProjectId: string; shotIds?: string[]; targetProductId?: string }) =>
      cloneService.scoreShotVariants(payload),
  )
  ipcMain.handle(
    'clone:buildVideoPlans',
    async (
      _e,
      payload: {
        cloneProjectId: string
        targetProductId?: string
        planCount?: number
        maxVideosToGenerate?: number
        strategy?: 'balanced' | 'hook_first' | 'conversion_first' | 'anti_duplicate'
      },
    ) => cloneService.buildVideoPlans(payload),
  )
  ipcMain.handle(
    'clone:buildScriptCandidates',
    async (_e, payload: { cloneProjectId: string }) => cloneService.buildScriptCandidates(payload),
  )
  ipcMain.handle(
    'clone:generateConsistencyAssets',
    async (
      _e,
      payload: {
        cloneProjectId: string
        productType?: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
        productPoints?: string
        productReferenceImagePaths?: string[]
        generateModelPack?: boolean
        forceRegenerateModelPack?: boolean
      },
    ) => cloneService.generateConsistencyAssets(payload),
  )
  ipcMain.handle(
    'clone:runStoryboardAndVideoBatch',
    async (
      _e,
      payload: {
        cloneProjectId: string
        topN?: number
        onlyMissing?: boolean
        variantsPerShot?: number
        productReferenceImagePaths?: string[]
        targetProductId?: string
        previewFirst?: boolean
      },
    ) => cloneService.runStoryboardAndVideoBatch(payload),
  )
  ipcMain.handle(
    'clone:updateVariantReview',
    async (
      _e,
      payload: { cloneProjectId: string; shotId: string; variantId: string; reviewStatus: 'pending' | 'keep' | 'reject' },
    ) => cloneService.updateVariantReview(payload),
  )
  ipcMain.handle(
    'clone:updateVideoPlanStatus',
    async (
      _e,
      payload: { cloneProjectId: string; videoPlanId: string; status: 'draft' | 'selected' | 'generating' | 'done' | 'failed' | 'rejected' },
    ) => cloneService.updateVideoPlanStatus(payload),
  )
  ipcMain.handle('clone:listProjects', async () => {
    return await cloneService.listProjects()
  })
  ipcMain.handle(
    'clone:listProjectSummaries',
    async (_e, payload?: { query?: string; status?: string; archived?: boolean }) => {
      return await cloneService.listProjectSummaries(payload)
    },
  )
  ipcMain.handle('clone:listModelIdentityLibrary', async () => {
    return await cloneService.listModelIdentityLibrary()
  })
  ipcMain.handle('clone:listModelTasks', async () => {
    return await cloneService.listModelTasks()
  })
  ipcMain.handle(
    'clone:createModelTask',
    async (
      _e,
      payload?: {
        title?: string
        description?: string
        sourceProjectId?: string
        productType?: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
      },
    ) => {
      return await cloneService.createModelTask(payload)
    },
  )
  ipcMain.handle('clone:getGenerationQueue', async (_e, payload: { cloneProjectId: string }) => {
    return await cloneService.getGenerationQueue(payload)
  })
  ipcMain.handle('clone:pauseGenerationQueue', async (_e, payload: { cloneProjectId: string }) => {
    return await cloneService.pauseGenerationQueue(payload)
  })
  ipcMain.handle('clone:resumeGenerationQueue', async (_e, payload: { cloneProjectId: string }) => {
    return await cloneService.resumeGenerationQueue(payload)
  })
  ipcMain.handle('clone:renameModelIdentity', async (_e, payload: { id: string; name: string }) => {
    return await cloneService.renameModelIdentity(payload)
  })
  ipcMain.handle('clone:deleteModelIdentity', async (_e, payload: { id: string }) => {
    return await cloneService.deleteModelIdentity(payload)
  })
  ipcMain.handle(
    'clone:selectProjectModelIdentity',
    async (_e, payload: { cloneProjectId: string; identityId: string }) => {
      return await cloneService.selectProjectModelIdentity(payload)
    },
  )
  ipcMain.handle(
    'clone:exportFinalVideos',
    async (_e, payload: { cloneProjectIds: string[]; outputDir: string }) => {
      return await cloneService.exportFinalVideos(payload)
    },
  )
  ipcMain.handle('clone:removeProject', async (_e, payload: { cloneProjectId: string; force?: boolean }) => {
    return await cloneService.removeProject(payload)
  })
  ipcMain.handle(
    'clone:updateShot',
    async (
      _e,
      payload: {
        cloneProjectId: string
        shotId: string
        sourceMode?: 'uploaded' | 'pending' | 'ai'
        uploadedAssetIds?: string[]
        aiEnabled?: boolean
        promptOverrides?: Partial<{ positive: string; negative: string; cameraMotion: string }>
        reviewStatus?: 'pending' | 'keep' | 'reject'
      },
    ) => {
      return await cloneService.updateShot(payload)
    },
  )
  ipcMain.handle(
    'clone:updateShotEnhanced',
    async (
      _e,
        payload: {
          cloneProjectId: string
          shotId: string
          replaceMode?: 'upload_video' | 'upload_image_to_video' | 'ai_generate' | 'locked'
          uploadedAssetPath?: string
          uploadedImagePath?: string
          aiPrompt?: string
          negativePrompt?: string
          locked?: boolean
          qualityMode?: 'fast' | 'standard' | 'high'
          productType?: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
          cloneEligible?: boolean
          filterReason?: string
          cloneClass?: 'real_product' | 'model_demo' | 'screen_recording' | 'tutorial_talking' | 'ui_demo' | 'result_showcase'
          productMainImage?: string
          productDetailImages?: string[]
          productUsageImages?: string[]
          styleReferenceImages?: string[]
          scriptText?: string
          scriptRole?: 'hook' | 'pain_point' | 'solution' | 'show' | 'detail' | 'proof' | 'offer' | 'cta' | 'transition' | 'unknown'
          narrationText?: string
          onScreenText?: string
          visualDescription?: string
          actionDescription?: string
          cameraDescription?: string
          productFocus?: string
          generationPrompt?: string
          scriptConfidence?: number
          analysisNotes?: string[]
        },
    ) => cloneService.updateShotEnhanced(payload),
  )
  ipcMain.handle(
    'clone:uploadShotAssets',
    async (
      _e,
      payload: {
        cloneProjectId: string
        shotId: string
        targetProductId: string
        filePaths: string[]
      },
    ) => {
      return await cloneService.uploadShotAssets(payload)
    },
  )
  ipcMain.handle(
    'clone:generateAiShots',
    async (
      _e,
        payload: {
          cloneProjectId: string
          shotIds: string[]
          videoPlanId?: string
          providerPolicy?: { chain?: Array<'seedance' | 'grsai'> }
          qualityProfile?: 'high'
        },
    ) => {
      return await cloneService.generateAiShots(payload)
    },
  )
  ipcMain.handle(
    'clone:generateShotKeyframes',
    async (
      _e,
      payload: {
        cloneProjectId: string
        shotIds: string[]
        targetProductId?: string
        providerPolicy?: { chain?: Array<'seedance'> }
      },
    ) => {
      return await cloneService.generateShotKeyframes(payload)
    },
  )
  ipcMain.handle(
    'clone:regenerateShotKeyframe',
    async (
      _e,
      payload: {
        cloneProjectId: string
        shotId: string
        which: 'start' | 'end'
        promptOverrides?: Partial<{ positive: string; negative: string; cameraMotion: string }>
      },
    ) => {
      return await cloneService.regenerateShotKeyframe(payload)
    },
  )
  ipcMain.handle(
    'clone:generateShotVideos',
    async (
      _e,
      payload: {
        cloneProjectId: string
        sessionId?: string
        shotIds: string[]
        consistencyMode?: 'soft' | 'hard'
        providerPolicy?: { chain?: Array<'seedance'> }
      },
    ) => {
      return await cloneService.generateShotVideos(payload)
    },
  )
  ipcMain.handle(
    'clone:getShotConsistencyReport',
    async (_e, payload: { cloneProjectId: string; shotId: string }) => cloneService.getShotConsistencyReport(payload),
  )
  ipcMain.handle(
    'clone:getShotImagePromptPreview',
    async (_e, payload: { cloneProjectId: string; shotId: string; selectedModelIdentityId?: string }) =>
      cloneService.getShotImagePromptPreview(payload),
  )
  ipcMain.handle(
    'clone:getShotVideoPromptPreview',
    async (_e, payload: { cloneProjectId: string; shotId: string }) => cloneService.getShotVideoPromptPreview(payload),
  )
  ipcMain.handle(
    'clone:recompileShotConsistency',
    async (_e, payload: { cloneProjectId: string; shotId: string }) => cloneService.recompileShotConsistency(payload),
  )
  ipcMain.handle(
    'clone:listShotConsistencyAnchors',
    async (_e, payload: { cloneProjectId: string; shotId: string }) => cloneService.listShotConsistencyAnchors(payload),
  )
  ipcMain.handle(
    'clone:listShotConsistencyPatches',
    async (_e, payload: { cloneProjectId: string; shotId: string }) => cloneService.listShotConsistencyPatches(payload),
  )
  ipcMain.handle(
    'clone:generateShotFrames',
    async (_e, payload: { cloneProjectId: string; shotId: string; productReferenceImagePaths?: string[] }) =>
      cloneService.generateShotFrames(payload),
  )
  ipcMain.handle(
    'clone:generateAllShotFrames',
    async (
      _e,
      payload: {
        cloneProjectId: string
        onlyMissing?: boolean
        forceRegenerate?: boolean
        shotIds?: string[]
        productReferenceImagePaths?: string[]
      },
    ) => cloneService.generateAllShotFrames(payload),
  )
  ipcMain.handle(
    'clone:generateModelIdentityPack',
    async (
      _e,
      payload: {
        cloneProjectId?: string
        modelTaskId?: string
        productType?: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
        productPoints?: string
        modelProfileOptions?: import('../shared/modelProfileOptions').ModelProfileOptions
        productReferenceImagePaths?: string[]
        imageProviderPrimary?: 'openai' | 'kling' | 'grsai' | 'apifox_hub'
        openaiApiKey?: string
        openaiImageModel?: string
        openaiImageQuality?: 'low' | 'medium' | 'high'
        grsaiApiKey?: string
        grsaiHost?: string
        grsaiImageModel?: string
        imageProviderCredentials?: Partial<import('./modules/clone/types').ModelCredentials>
      },
    ) => cloneService.generateModelIdentityPack(payload),
  )
  ipcMain.handle(
    'clone:getModelIdentityPromptPreview',
    async (
      _e,
      payload: {
        cloneProjectId?: string
        modelTaskId?: string
        productType?: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
        productPoints?: string
        modelProfileOptions?: import('../shared/modelProfileOptions').ModelProfileOptions
        productReferenceImagePaths?: string[]
      },
    ) => cloneService.getModelIdentityPromptPreview(payload),
  )
  ipcMain.handle(
    'clone:getProjectIdentityGridPromptPreview',
    async (
      _e,
      payload: {
        cloneProjectId: string
        productType?: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
        productPoints?: string
        modelProfileOptions?: import('../shared/modelProfileOptions').ModelProfileOptions
        productReferenceImagePaths?: string[]
      },
    ) => cloneService.getProjectIdentityGridPromptPreview(payload),
  )
  ipcMain.handle(
    'clone:selectModelIdentityPack',
    async (_e, payload: { cloneProjectId: string; packId: string; confirmed?: boolean }) =>
      cloneService.selectModelIdentityPack(payload),
  )
  ipcMain.handle(
    'clone:generateGptShotFrames',
    async (
      _e,
      payload: {
        cloneProjectId: string
        shotId: string
        which?: 'start' | 'end' | 'both'
        selectedModelIdentityId?: string
        productReferenceImagePaths?: string[]
        imageProviderPrimary?: 'openai' | 'kling' | 'grsai' | 'apifox_hub'
        openaiApiKey?: string
        openaiImageModel?: string
        openaiImageQuality?: 'low' | 'medium' | 'high'
        grsaiApiKey?: string
        grsaiHost?: string
        grsaiImageModel?: string
        imageProviderCredentials?: Partial<import('./modules/clone/types').ModelCredentials>
      },
    ) => cloneService.generateGptShotFrames(payload),
  )
  ipcMain.handle(
    'clone:confirmGptShotFrames',
    async (_e, payload: { cloneProjectId: string; shotId: string; confirmed?: boolean }) =>
      cloneService.confirmGptShotFrames(payload),
  )
  ipcMain.handle(
    'clone:generateShotClip',
    async (_e, payload: { cloneProjectId: string; shotId: string; forceRegenerate?: boolean }) => cloneService.generateShotClip(payload),
  )
  ipcMain.handle(
    'clone:regenerateShotVideo',
    async (_e, payload: { cloneProjectId: string; shotId: string }) => cloneService.regenerateShotVideo(payload),
  )
  ipcMain.handle(
    'clone:syncShotVideoTask',
    async (_e, payload: { cloneProjectId: string; shotId: string }) => cloneService.syncShotVideoTask(payload),
  )
  ipcMain.handle(
    'clone:qualityCheckCurrentShot',
    async (_e, payload: { cloneProjectId: string; shotId: string }) => cloneService.qualityCheckCurrentShot(payload),
  )
  ipcMain.handle(
    'clone:diagnoseProductImages',
    async (_e, payload: { imagePaths: string[] }) => cloneService.diagnoseProductImages(payload),
  )
  ipcMain.handle(
    'clone:renderPreview',
    async (_e, payload: { cloneProjectId: string; outputDir?: string }) => cloneService.renderPreview(payload),
  )
  ipcMain.handle(
    'clone:renderBatch',
    async (
      _e,
      payload: { cloneProjectId: string; count: number; outputDir?: string; retryFailed?: boolean },
    ) => cloneService.renderBatch(payload),
  )
  ipcMain.handle(
    'clone:saveCloneTemplate',
    async (_e, payload: { cloneProjectId: string; name?: string }) => cloneService.saveCloneTemplate(payload),
  )
  ipcMain.handle(
    'clone:convertToNormalTemplate',
    async (_e, payload: { cloneProjectId: string; name?: string }) => cloneService.convertToNormalTemplate(payload),
  )
  ipcMain.handle(
    'clone:createSession',
    async (
      _e,
      payload: {
        cloneProjectId: string
        targetProductId: string
        count: number
        outputDir?: string
        qualityProfile?: 'high'
        variantStrength?: 'low' | 'medium' | 'high'
        pipelineMode?: 'keyframe_then_video'
      },
    ) => {
      return await cloneService.createSession(payload)
    },
  )
  ipcMain.handle(
    'clone:listSessionResults',
    async (
      _e,
      payload: {
        cloneProjectId: string
        sessionId?: string
        filters?: {
          status?: Array<'pending' | 'passed' | 'rejected' | 'failed'>
          onlyLowScore?: boolean
          targetProductId?: string
        }
      },
    ) => {
      return await cloneService.listSessionResults(payload)
    },
  )
  ipcMain.handle(
    'clone:updateSessionReview',
    async (
      _e,
      payload: {
        cloneProjectId: string
        taskId: string
        reviewStatus: 'pending' | 'keep' | 'reject'
      },
    ) => {
      return await cloneService.updateSessionReview(payload)
    },
  )
  ipcMain.handle(
    'clone:createReplicas',
    async (
      _e,
      payload: {
        cloneProjectId: string
        count: number
        outputDir?: string
        reviewMode?: 'manual'
      },
    ) => {
      return await cloneService.createReplicas(payload)
    },
  )
  ipcMain.handle(
    'clone:updateReplicaReview',
    async (
      _e,
      payload: {
        cloneProjectId: string
        taskId: string
        reviewStatus: 'pending' | 'keep' | 'reject'
      },
    ) => {
      return await cloneService.updateReplicaReview(payload)
    },
  )
  ipcMain.handle('clone:getModelCredentials', async () => {
    return await cloneService.getModelCredentials()
  })
  ipcMain.handle('clone:getRuntimeOptions', async () => {
    return await cloneService.getRuntimeOptions()
  })
  ipcMain.handle('clone:getHermesIntegrationSettings', async () => {
    return await cloneService.getHermesIntegrationSettings()
  })
  ipcMain.handle(
    'clone:setModelCredentials',
    async (
      _e,
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
    },
  )
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
  ipcMain.handle(
    'clone:setHermesIntegrationSettings',
    async (
      _e,
      payload: {
        enabled?: boolean
        callbackBaseUrl?: string
        feishu?: import('./modules/clone/types').HermesFeishuIntegrationSettings
        wecom?: import('./modules/clone/types').HermesWecomIntegrationSettings
      },
    ) => {
      return await cloneService.setHermesIntegrationSettings(payload)
    },
  )
  ipcMain.handle('clone:getGrsAiCredits', async () => {
    return await cloneService.getGrsAiCredits()
  })

  registerAppShellMediaIpc(ipcMain, () => mainWindow, () => mainUiLocale)
  registerProductsIpc(ipcMain)
  registerLivePhotoIpc(ipcMain)
  registerHermesLivePhotoIpc(ipcMain)
  registerProductImageMaterialsIpc(ipcMain)
  registerTiktokCreativeStudioIpc(ipcMain)
  registerTiktokListingIpc(ipcMain)
  registerTemplatesTasksIpc(ipcMain, () => mainWindow)
  registerVideoParserDownloadIpc(ipcMain)
  registerAgentOsIpc(ipcMain, () => mainWindow)
  registerHermesAgentIpc(ipcMain, () => mainWindow)
  registerStorageManagementIpc(ipcMain)
}

app.whenReady().then(async () => {
  markStartupStage('app-ready')
  mainUiLocale = normalizeAppLocale(app.getLocale())
  await migrateLegacyWindowsUserData()
  markStartupStage('legacy-storage-migrated')
  await ensureAppDirs()
  // Keep startup paths ready before renderer IPC requests begin.
  wireIpc()
  await wireMediaProtocol()
  createWindow()
  registerUpdaterIpc(() => mainWindow)
  setupAutoUpdater(() => mainWindow)

  setTimeout(() => {
    void (async () => {
      markStartupStage('background-initialization-start')
      try {
        await cleanupLegacyWindowsStorage()
        await agentOsService.initialize()
        void hermesRuntime.start()
          .then(async () => {
            await hermesManagement.migrateLegacyIntegrationSettings()
            const channels = await hermesManagement.listChannels()
            if (channels.some((channel) => channel.enabled)) await hermesManagement.startGateway().catch(() => undefined)
            markStartupStage('hermes-ready')
          })
          .catch((error) => {
            console.error('[hermes-runtime] startup failed', String((error as Error)?.message || error))
          })
        await productsRepo.ensureSeed()
        const productImageMigration = await productsRepo.migrateExternalImages()
        if (productImageMigration.migrated || productImageMigration.missing) {
          console.log('[products] external-image-migration', productImageMigration)
        }
        await templatesRepo.ensureSeed()
        await cloneRepo.ensureSeed()
        await webPlatformRepo.ensureSeed()
        const managedAssetMigrations = await Promise.all([
          templatesRepo.migrateExternalAssets(),
          cloneRepo.migrateExternalAssets(),
          webPlatformRepo.migrateBatchSubtitleExternalAssets(),
          productImageMaterialsRepo.migrateExternalAssets(),
          tiktokListingRepo.migrateExternalAssets(),
          tiktokCreativeStudioRepo.migrateExternalAssets(),
          livePhotoRepo.migrateExternalAssets(),
        ])
        const migratedManagedAssets = managedAssetMigrations.reduce((total, item) => total + item.migrated, 0)
        if (migratedManagedAssets) {
          console.log('[managed-assets] external-asset-migration', { migrated: migratedManagedAssets })
        }
        await videoParserDownloadService.initialize()
        await productImageMaterialsService.initialize()
        await ensureWebApiServer()
        await cloneService.resumePendingRemoteStoryboardVideosOnStartup()
        await livePhotoService.resumePendingTasksOnStartup()
        await tiktokCreativeStudioService.resumePending()
        markStartupStage('background-initialization-complete')
      } catch (error: any) {
        console.error('[app-startup] bootstrap-failed', {
          message: String(error?.message ?? error ?? 'unknown error'),
          stack: String(error?.stack ?? ''),
        })
        if (!mainWindow || mainWindow.isDestroyed()) {
          dialog.showErrorBox(
            'VideoGenerate Startup Failed',
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
  stopLocalLivePhotoQualityChecker()
  void stopPreviewHttpServer()
  void stopWebApiServer()
  void hermesRuntime.stop()
})
