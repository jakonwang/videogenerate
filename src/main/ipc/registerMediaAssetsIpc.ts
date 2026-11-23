import { join } from 'node:path'
import type { IpcMain } from 'electron'
import { listBundledLuts } from '../lib/luts'
import { importUserFonts, listUserFontFiles, userFontsDir } from '../lib/userFonts'
import { assessImportedFontFile, listBundledFontFiles, listRenderableAssFamilies } from '../lib/fontResolve'
import { listBundledStickers, toStickerRef } from '../lib/stickers'
import { importUserStickers, listUserStickerFiles, userStickersDir } from '../lib/userStickers'

/**
 * 模板库用的 LUT / 贴纸 / 字体：内置列表和用户导入。
 * 电脑端和服务器复刻引擎（网页的模板库）都注册这一份；网页只能读取列表，导入要在电脑端做。
 */
export function registerMediaAssetsIpc(ipc: Pick<IpcMain, 'handle'>) {
  ipc.handle('luts:list', async () => {
    return listBundledLuts().map((x) => ({ fileName: x.fileName, displayName: x.displayName }))
  })

  ipc.handle('stickers:list', async () => {
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

  ipc.handle('stickers:listUser', async () => {
    const files = await listUserStickerFiles()
    return { dir: userStickersDir(), files: files.map((x) => x.fileName) }
  })

  ipc.handle('stickers:import', async (_e, paths: string[]) => {
    return await importUserStickers(Array.isArray(paths) ? paths.map((x) => String(x)) : [])
  })

  ipc.handle('fonts:listUser', async () => {
    const files = await listUserFontFiles()
    const enriched = await Promise.all(files.map((x) => assessImportedFontFile({ fileName: x.fileName, absPath: x.absPath })))
    return { dir: userFontsDir(), files: files.map((x) => x.fileName), fonts: enriched }
  })

  ipc.handle('fonts:list', async () => {
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

  ipc.handle('fonts:import', async (_e, paths: string[]) => {
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
}
