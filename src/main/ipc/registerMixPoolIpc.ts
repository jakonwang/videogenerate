import type { BrowserWindow, IpcMain } from 'electron'
import { dialog } from 'electron'
import { mixPoolService } from '../modules/mix-pool/service'
import type { ClipOrigin, ClipRole } from '../../shared/mixPool'
import type { MixDraft, MixFormula, MixJobInput } from '../../shared/mixFormula'
import { mixStudioService } from '../modules/mix-studio/service'
import { registerRelayHandler } from '../modules/cloud-sync/relayWorker'

const asOrigin = (v: unknown): ClipOrigin => (v === 'real' || v === 'ai' ? v : 'unknown')
const id = (v: unknown) => String(v ?? '').trim()

export function registerMixPoolIpc(ipcMain: IpcMain, getMainWindow: () => BrowserWindow | null) {
  // The web version of these pages (through the live relay) cannot get pushed events: it reads the latest progress instead.
  const latestProgress = new Map<string, Record<string, unknown> & { at: number }>()
  mixPoolService.setProgressListener((p) => {
    getMainWindow()?.webContents.send('mixPool:progress', p)
    const productId = String((p as { productId?: unknown })?.productId ?? '')
    if (productId) latestProgress.set(productId, { ...(p as Record<string, unknown>), at: Date.now() })
  })
  registerRelayHandler('mixPool:latestProgress', async () => [...latestProgress.values()].filter((p) => Date.now() - p.at < 10 * 60_000))
  // Web: files picked in the browser arrive as cloudfile: references, downloaded to this computer before the call.
  registerRelayHandler('mixPool:importPaths', async (_e, raw) => {
    const payload = raw as { productId?: string; paths?: unknown; origin?: unknown } | undefined
    return mixPoolService.importFiles(id(payload?.productId), (Array.isArray(payload?.paths) ? payload.paths : []).map(id).filter(Boolean), asOrigin(payload?.origin))
  })

  ipcMain.handle('mixPool:overview', async (_e, productId: string) => ({
    ...(await mixPoolService.overview(id(productId))),
    running: mixPoolService.isRunning(id(productId)),
  }))
  ipcMain.handle('mixPool:syncLinked', async (_e, productId: string) => mixPoolService.syncLinked(id(productId)))
  ipcMain.handle('mixPool:importFiles', async (_e, payload: { productId: string; origin?: ClipOrigin }) => {
    const picked = await dialog.showOpenDialog({
      title: '导入混剪素材',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv'] }],
    })
    if (picked.canceled || !picked.filePaths.length) return { added: 0, skipped: 0 }
    return mixPoolService.importFiles(id(payload?.productId), picked.filePaths, asOrigin(payload?.origin))
  })
  ipcMain.handle('mixPool:process', async (_e, productId: string) => mixPoolService.process(id(productId)))
  ipcMain.handle('mixPool:retag', async (_e, payload: { productId: string; clipIds?: string[] }) =>
    mixPoolService.retag(id(payload?.productId), Array.isArray(payload?.clipIds) ? payload.clipIds.map(id) : undefined),
  )
  ipcMain.handle('mixPool:resplitSource', async (_e, payload: { productId: string; sourceId: string }) =>
    mixPoolService.resplitSource(id(payload?.sourceId), id(payload?.productId)),
  )
  ipcMain.handle('mixPool:updateClip', async (_e, payload: { id: string; roleOverride?: ClipRole | null; disabled?: boolean }) => {
    const patch: { roleOverride?: ClipRole | null; disabled?: boolean } = {}
    if (payload && 'roleOverride' in payload) patch.roleOverride = payload.roleOverride ?? null
    if (typeof payload?.disabled === 'boolean') patch.disabled = payload.disabled
    return mixPoolService.updateClip(id(payload?.id), patch)
  })
  ipcMain.handle('mixPool:setSourceOrigin', async (_e, payload: { sourceId: string; origin: ClipOrigin }) =>
    mixPoolService.setSourceOrigin(id(payload?.sourceId), asOrigin(payload?.origin)),
  )
  ipcMain.handle('mixPool:removeSource', async (_e, sourceId: string) => mixPoolService.removeSource(id(sourceId)))
}

export function registerMixStudioIpc(ipcMain: IpcMain) {
  // Web: the reference video picked in the browser (cloudfile:, downloaded before the call).
  registerRelayHandler('mixStudio:formulaFromReferencePath', async (_e, raw) => {
    const payload = raw as { videoPath?: string; name?: string } | undefined
    return mixStudioService.formulaFromReference({ videoPath: id(payload?.videoPath), name: payload?.name })
  })
  ipcMain.handle('mixStudio:listFormulas', async () => mixStudioService.listFormulas())
  ipcMain.handle('mixStudio:saveFormula', async (_e, formula: MixFormula) => mixStudioService.saveFormula(formula))
  ipcMain.handle('mixStudio:removeFormula', async (_e, formulaId: string) => mixStudioService.removeFormula(id(formulaId)))
  ipcMain.handle('mixStudio:formulaFromReference', async (_e, payload?: { name?: string }) => {
    const picked = await dialog.showOpenDialog({
      title: '选择参考爆款视频',
      properties: ['openFile'],
      filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv'] }],
    })
    if (picked.canceled || !picked.filePaths[0]) return null
    return mixStudioService.formulaFromReference({ videoPath: picked.filePaths[0], name: payload?.name })
  })
  ipcMain.handle('mixStudio:preview', async (_e, input: MixJobInput) => mixStudioService.preview(input))
  ipcMain.handle('mixStudio:enqueue', async (_e, payload: { input: MixJobInput; drafts: MixDraft[] }) =>
    mixStudioService.enqueue(payload.input, Array.isArray(payload?.drafts) ? payload.drafts : []),
  )
  ipcMain.handle('mixStudio:ledger', async (_e, productId?: string) => mixStudioService.ledger(productId ? id(productId) : undefined))
  ipcMain.handle('mixStudio:insights', async (_e, productId?: string) => mixStudioService.insights(productId ? id(productId) : undefined))
  ipcMain.handle('mixStudio:refreshPerformance', async () => mixStudioService.refreshPerformance())
  ipcMain.handle('mixStudio:listCreatives', async () => mixStudioService.listCreatives())
  ipcMain.handle('mixStudio:linkCreative', async (_e, payload: { entryId: string; creativeId: string | null }) =>
    mixStudioService.linkCreative(id(payload?.entryId), payload?.creativeId ? id(payload.creativeId) : null),
  )
  ipcMain.handle('mixStudio:sendToPublish', async (_e, entryIds: string[]) => mixStudioService.sendToPublish(Array.isArray(entryIds) ? entryIds.map(id) : []))
  ipcMain.handle('mixStudio:removeLedgerEntry', async (_e, entryId: string) => mixStudioService.removeLedgerEntry(id(entryId)))
}
