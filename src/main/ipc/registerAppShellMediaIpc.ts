import type { BrowserWindow, IpcMain } from 'electron'
import { dialog, shell } from 'electron'
import { basename, extname } from 'node:path'
import { copyFile } from 'node:fs/promises'
import { getMediaInfo } from '../modules/media/info'
import { splitVideoToSegmentFiles } from '../modules/media/segmentSplit'
import type { AppLocale } from '../../shared/locale'

export function registerAppShellMediaIpc(
  ipcMain: IpcMain,
  _getMainWindow: () => BrowserWindow | null,
  _getMainUiLocale: () => AppLocale,
) {
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
    const p = String(fullPath ?? '').trim()
    if (!p) throw new Error('A file path is required.')
    const error = await shell.openPath(p)
    if (error) throw new Error(error)
    return { ok: true }
  })

  ipcMain.handle('shell:openExternal', async (_e, value: string) => {
    const raw = String(value ?? '').trim()
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      throw new Error('The external URL is invalid.')
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Only HTTP and HTTPS links can be opened.')
    }
    await shell.openExternal(url.toString())
    return { ok: true }
  })

  ipcMain.handle('fs:saveFileAs', async (_e, payload: { sourcePath: string; defaultFileName?: string; title?: string }) => {
    const sourcePath = String(payload?.sourcePath ?? '').trim()
    if (!sourcePath) throw new Error('源文件路径不能为空')
    const defaultFileName = String(payload?.defaultFileName ?? '').trim() || basename(sourcePath) || 'download'
    const extension = extname(defaultFileName)
    const filters = extension
      ? [{ name: `${extension.replace('.', '').toUpperCase()} 文件`, extensions: [extension.replace('.', '')] }]
      : undefined
    const result = await dialog.showSaveDialog({
      title: String(payload?.title ?? '').trim() || '保存文件',
      defaultPath: defaultFileName,
      filters,
    })
    if (result.canceled || !result.filePath) return { ok: false as const, canceled: true as const }
    await copyFile(sourcePath, result.filePath)
    return { ok: true as const, canceled: false as const, filePath: result.filePath }
  })
}
