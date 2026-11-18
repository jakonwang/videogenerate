import type { IpcMain, WebContents } from 'electron'
import { analyzeLiveVideo, probeLiveSource } from '../modules/live-slicer/analyze'
import { exportLiveSegments, type LiveSlicerExportOptions, type LiveSlicerExportSegment } from '../modules/live-slicer/export'
import { generateThumbnailJpg } from '../modules/media/thumbnail'

const jobs = new Map<string, AbortController>()

function errorText(e: unknown) {
  return String((e as any)?.message ?? e)
}

function startJob(jobId: string) {
  jobs.get(jobId)?.abort()
  const controller = new AbortController()
  jobs.set(jobId, controller)
  return controller
}

function endJob(jobId: string, controller: AbortController) {
  if (jobs.get(jobId) === controller) jobs.delete(jobId)
}

function sendProgress(wc: WebContents, data: Record<string, unknown>) {
  if (!wc.isDestroyed()) wc.send('liveSlicer:progress', data)
}

export function registerLiveSlicerIpc(ipcMain: IpcMain) {
  ipcMain.handle('liveSlicer:probe', async (_e, inputPath: string) => {
    try {
      return { ok: true as const, source: await probeLiveSource(inputPath) }
    } catch (e) {
      return { ok: false as const, error: errorText(e) }
    }
  })

  ipcMain.handle('liveSlicer:analyze', async (event, payload: { jobId: string; inputPath: string }) => {
    const jobId = String(payload?.jobId ?? '')
    const controller = startJob(jobId)
    try {
      const analysis = await analyzeLiveVideo({
        inputPath: String(payload?.inputPath ?? ''),
        signal: controller.signal,
        onProgress: (p) => sendProgress(event.sender, { jobId, kind: 'analyze', ...p }),
      })
      return { ok: true as const, analysis }
    } catch (e) {
      return { ok: false as const, cancelled: controller.signal.aborted, error: errorText(e) }
    } finally {
      endJob(jobId, controller)
    }
  })

  ipcMain.handle('liveSlicer:thumbnail', async (_e, payload: { inputPath: string; atSec: number; width?: number; height?: number }) => {
    const width = Math.max(32, Math.min(640, Math.round(Number(payload?.width) || 256)))
    const height = Math.max(32, Math.min(640, Math.round(Number(payload?.height) || 144)))
    return await generateThumbnailJpg({
      filePath: String(payload?.inputPath ?? ''),
      atSec: Math.max(0, Math.round((Number(payload?.atSec) || 0) * 10) / 10),
      width,
      height,
    })
  })

  ipcMain.handle(
    'liveSlicer:export',
    async (event, payload: { jobId: string; inputPath: string; segments: LiveSlicerExportSegment[]; options: LiveSlicerExportOptions }) => {
      const jobId = String(payload?.jobId ?? '')
      const controller = startJob(jobId)
      try {
        const out = await exportLiveSegments({
          inputPath: String(payload?.inputPath ?? ''),
          segments: Array.isArray(payload?.segments) ? payload.segments : [],
          options: payload?.options,
          signal: controller.signal,
          onProgress: (p) => sendProgress(event.sender, { jobId, kind: 'export', ...p }),
        })
        return { ok: true as const, ...out }
      } catch (e) {
        return { ok: false as const, cancelled: controller.signal.aborted, error: errorText(e) }
      } finally {
        endJob(jobId, controller)
      }
    },
  )

  ipcMain.handle('liveSlicer:cancel', async (_e, jobId: string) => {
    jobs.get(String(jobId ?? ''))?.abort()
    return { ok: true }
  })
}
