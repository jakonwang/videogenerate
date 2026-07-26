import type { BrowserWindow, IpcMain } from 'electron'
import { createBatchTasks } from '../modules/tasks/createBatchTasks'
import { taskQueue } from '../modules/tasks/queue'
import { templatesRepo } from '../modules/templates/repo'
import { getLanIPv4 } from '../lib/lanAddress'
import { ensurePreviewHttpServer } from '../lib/previewHttpServer'

export function registerTemplatesTasksIpc(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null,
) {
  ipcMain.handle('templates:list', async () => templatesRepo.list())
  ipcMain.handle('templates:upsert', async (_e, payload) => templatesRepo.upsert(payload))
  ipcMain.handle('templates:remove', async (_e, id: string) => templatesRepo.remove(id))

  ipcMain.handle('tasks:list', async () => taskQueue.list())
  ipcMain.handle('tasks:stats', async () => taskQueue.stats())
  ipcMain.handle('tasks:retry', async (_e, id: string) => taskQueue.retryTask(String(id || '').trim()))
  ipcMain.handle('tasks:cancel', async (_e, id: string) => taskQueue.cancelTask(String(id || '').trim()))
  ipcMain.handle('tasks:remove', async (_e, id: string) => taskQueue.removeTask(String(id || '').trim()))
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
    getMainWindow()?.webContents.send('tasks:event', evt)
  })
}
