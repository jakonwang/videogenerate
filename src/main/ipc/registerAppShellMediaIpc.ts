import type { BrowserWindow, IpcMain } from 'electron'
import { shell } from 'electron'
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
    const p = String(fullPath ?? '')
    await shell.openPath(p)
    return { ok: true }
  })
}
