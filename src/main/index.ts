import { app, BrowserWindow, ipcMain, dialog, shell, protocol } from 'electron'
import { join } from 'node:path'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { ensureAppDirs, getAppPaths } from './lib/paths'
import { productsRepo } from './modules/products/repo'
import { templatesRepo } from './modules/templates/repo'
import { taskQueue } from './modules/tasks/queue'
import { createBatchTasks } from './modules/tasks/createBatchTasks'
import { getMediaInfo } from './modules/media/info'
import { splitVideoToSegmentFiles } from './modules/media/segmentSplit'
import { analyzeVideoFolderAndSuggestTemplate } from './modules/style/analyzeVideos'
import { normalizeAppLocale, type AppLocale } from '../shared/locale'
import { defaultOpenDialogTitle } from './lib/dialogDefaults'
import { registerUpdaterIpc, setupAutoUpdater } from './lib/updater'
import { registerLicenseIpc } from './lib/license'
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
import { getLanIPv4 } from './lib/lanAddress'
import { ensurePreviewHttpServer, stopPreviewHttpServer } from './lib/previewHttpServer'
import { cloneRepo } from './modules/clone/repo'
import { cloneService } from './modules/clone/service'

let mainWindow: BrowserWindow | null = null

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
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
}

function createWindow() {
  const { preload } = getAppPaths()
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.center()
  mainWindow.once('ready-to-show', revealMainWindow)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.on('did-finish-load', revealMainWindow)
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[window] failed to load renderer', {
      errorCode,
      errorDescription,
      validatedURL,
    })
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(join(getAppPaths().rendererDist, 'index.html'))
  }
}

function wireIpc() {
  registerLicenseIpc()

  ipcMain.handle('app:getPaths', async () => getAppPaths())

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

  ipcMain.handle('fs:collectVideoFilesFromDrop', async (_e, roots: string[]) => {
    return await collectVideoFilesFromDropRoots(Array.isArray(roots) ? roots.map((x) => String(x)) : [])
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
    'clone:createBlueprint',
    async (_e, payload: { videoPath: string; locale?: 'vi-VN' | 'zh-CN'; strength?: 'structure' }) => {
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
      return await cloneService.generateStoryboardGridsForProject(payload)
    },
  )
  ipcMain.handle(
    'clone:generateShotVideosFromStoryboard',
    async (
      _e,
      payload: {
        cloneProjectId: string
      },
    ) => {
      return await cloneService.generateShotVideosFromStoryboardFrames(payload)
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
      },
    ) => {
      return await cloneService.composeCloneFinalVideo(payload)
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
  ipcMain.handle('clone:refreshProjectStatus', async (_e, payload: { cloneProjectId: string }) => {
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
  ipcMain.handle('clone:listModelIdentityLibrary', async () => {
    return await cloneService.listModelIdentityLibrary()
  })
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
  ipcMain.handle('clone:removeProject', async (_e, payload: { cloneProjectId: string }) => {
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
          providerPolicy?: { chain?: Array<'seedance' | 'kling' | 'grsai'> }
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
        providerPolicy?: { chain?: Array<'seedance' | 'kling'> }
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
        providerPolicy?: { chain?: Array<'seedance' | 'kling'> }
      },
    ) => {
      return await cloneService.generateShotVideos(payload)
    },
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
        cloneProjectId: string
        productType?: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
        productPoints?: string
        productReferenceImagePaths?: string[]
        imageProviderPrimary?: 'openai' | 'kling' | 'grsai'
        openaiApiKey?: string
        openaiImageModel?: string
        openaiImageQuality?: 'low' | 'medium' | 'high'
        klingApiKey?: string
        klingHost?: string
        klingImageModel?: string
        grsaiApiKey?: string
        grsaiHost?: string
        grsaiImageModel?: string
        imageProviderCredentials?: Partial<import('./modules/clone/types').ModelCredentials>
      },
    ) => cloneService.generateModelIdentityPack(payload),
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
        productReferenceImagePaths?: string[]
        imageProviderPrimary?: 'openai' | 'kling' | 'grsai'
        openaiApiKey?: string
        openaiImageModel?: string
        openaiImageQuality?: 'low' | 'medium' | 'high'
        klingApiKey?: string
        klingHost?: string
        klingImageModel?: string
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
  ipcMain.handle(
    'clone:setModelCredentials',
    async (
      _e,
      payload: {
        seedanceApiKey?: string
        seedanceHost?: string
        klingApiKey?: string
        klingHost?: string
        grsaiApiKey?: string
        grsaiHost?: string
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
        imageProviderPrimary?: 'openai' | 'kling' | 'grsai'
        klingImageModel?: string
        grsaiImageModel?: string
        apifoxHub?: import('./modules/clone/types').ApifoxHubCredentials
      },
    ) => {
      return await cloneService.setModelCredentials({
        seedanceApiKey: payload?.seedanceApiKey,
        seedanceHost: payload?.seedanceHost,
        klingApiKey: payload?.klingApiKey,
        klingHost: payload?.klingHost,
        grsaiApiKey: payload?.grsaiApiKey,
        grsaiHost: payload?.grsaiHost,
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
        chatProviderPrimary: payload?.chatProviderPrimary,
        videoProviderPrimary: payload?.videoProviderPrimary,
        videoProviderFallback: payload?.videoProviderFallback,
        openaiApiKey: payload?.openaiApiKey,
        openaiImageModel: payload?.openaiImageModel,
        openaiImageQuality: payload?.openaiImageQuality,
        imageProviderPrimary: payload?.imageProviderPrimary,
        klingImageModel: payload?.klingImageModel,
        grsaiImageModel: payload?.grsaiImageModel,
        apifoxHub: payload?.apifoxHub,
      })
    },
  )
  ipcMain.handle('clone:getGrsAiCredits', async () => {
    return await cloneService.getGrsAiCredits()
  })

  ipcMain.handle('media:getInfo', async (_e, filePath: string) => {
    return await getMediaInfo(filePath)
  })

  ipcMain.handle(
    'media:segmentSplit',
    async (event, payload: { inputPath: string; segmentTimeSec: number; outputDir?: string; outputFormat?: 'source' | 'mp4' }) => {
      const wc = event.sender
      const send = (data: Record<string, unknown>) => {
        if (!wc.isDestroyed()) wc.send('media:segmentSplitProgress', data)
      }
      try {
        const outputPaths = await splitVideoToSegmentFiles({
          inputPath: String(payload?.inputPath ?? ''),
          segmentTimeSec: Number(payload?.segmentTimeSec ?? 3),
          outputDir: String(payload?.outputDir ?? '').trim() || undefined,
          outputFormat: payload?.outputFormat === 'mp4' ? 'mp4' : 'source',
          onProgress: (p) => send({ phase: p.phase }),
        })
        send({ phase: 'done', count: outputPaths.length })
        return { ok: true as const, outputPaths }
      } catch (e: any) {
        return { ok: false as const, error: e?.message ?? String(e) }
      }
    },
  )

  ipcMain.handle('shell:showItemInFolder', async (_e, fullPath: string) => {
    shell.showItemInFolder(fullPath)
    return { ok: true }
  })

  ipcMain.handle('shell:openPath', async (_e, fullPath: string) => {
    const p = String(fullPath ?? '')
    await shell.openPath(p)
    return { ok: true }
  })

  ipcMain.handle('products:list', async () => productsRepo.list())
  ipcMain.handle('products:upsert', async (_e, payload) => productsRepo.upsert(payload))
  ipcMain.handle('products:remove', async (_e, id: string) => productsRepo.remove(id))
  ipcMain.handle('products:ensureSegmentBucketsFromTemplates', async () => productsRepo.ensureSegmentBucketsFromTemplates())

  ipcMain.handle('templates:list', async () => templatesRepo.list())
  ipcMain.handle('templates:upsert', async (_e, payload) => templatesRepo.upsert(payload))
  ipcMain.handle('templates:remove', async (_e, id: string) => templatesRepo.remove(id))

  ipcMain.handle('tasks:list', async () => taskQueue.list())
  ipcMain.handle('tasks:stats', async () => taskQueue.stats())
  ipcMain.handle('tasks:enqueueBatch', async (_e, payload: { productId: string; templateId: string; count: number; outDir: string }) => {
    const res = await createBatchTasks(payload)
    for (const t of res.tasks) taskQueue.enqueue(t)
    return res.meta
  })
  ipcMain.handle('tasks:pause', async () => {
    taskQueue.pause()
    return { ok: true }
  })
  ipcMain.handle('tasks:resume', async () => {
    taskQueue.resume()
    return { ok: true }
  })
  ipcMain.handle('tasks:cancelAll', async () => {
    taskQueue.cancelAll()
    return { ok: true }
  })

  ipcMain.handle('preview:getMobilePlayUrl', async (_e, taskId: string) => {
    const id = String(taskId ?? '').trim()
    const task = taskQueue.getTask(id)
    if (!task || task.status !== 'done' || !task.outPath?.trim()) {
      return { ok: false as const, code: 'not_done' as const }
    }
    try {
      const port = await ensurePreviewHttpServer()
      const ip = getLanIPv4()
      if (!ip) {
        return { ok: false as const, code: 'no_lan' as const }
      }
      const url = `http://${ip}:${port}/p/${id}`
      return { ok: true as const, url, port, ip }
    } catch (e: any) {
      return { ok: false as const, code: 'server' as const, detail: e?.message ?? String(e) }
    }
  })

  taskQueue.onEvent((evt) => {
    mainWindow?.webContents.send('tasks:event', evt)
  })
}

app.whenReady().then(async () => {
  mainUiLocale = normalizeAppLocale(app.getLocale())
  await ensureAppDirs()
  // 避免 Windows 某些环境下 GPU cache 目录权限问题
  const { cacheDir } = getAppPaths()
  app.commandLine.appendSwitch('disk-cache-dir', cacheDir)
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

  await productsRepo.ensureSeed()
  await templatesRepo.ensureSeed()
  await cloneRepo.ensureSeed()
  await wireMediaProtocol()
  createWindow()
  wireIpc()
  registerUpdaterIpc(() => mainWindow)
  setupAutoUpdater(() => mainWindow)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void stopPreviewHttpServer()
})

