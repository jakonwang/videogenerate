import { shell, type BrowserWindow, type IpcMain } from 'electron'
import { agentOsService } from '../modules/agent-os/service'

const EVENT_CHANNEL = 'agentOs:event'

export function registerAgentOsIpc(ipcMain: IpcMain, getWindow: () => BrowserWindow | null) {
  ipcMain.handle('agentOs:listEmployees', async () => await agentOsService.listEmployees())
  ipcMain.handle('agentOs:createEmployee', async (_event, payload) => await agentOsService.createEmployee(payload))
  ipcMain.handle('agentOs:updateEmployee', async (_event, payload) => await agentOsService.updateEmployee(payload))
  ipcMain.handle('agentOs:duplicateEmployee', async (_event, payload) => await agentOsService.duplicateEmployee(payload))
  ipcMain.handle('agentOs:archiveEmployee', async (_event, id: string) => await agentOsService.archiveEmployee(id))

  ipcMain.handle('agentOs:createConversation', async (_event, payload) => await agentOsService.createConversation(payload))
  ipcMain.handle('agentOs:listConversations', async (_event, limit?: number) => await agentOsService.listConversations(limit))
  ipcMain.handle('agentOs:getConversation', async (_event, id: string) => await agentOsService.getConversation(id))
  ipcMain.handle('agentOs:sendMessage', async (_event, payload) => await agentOsService.sendMessage(payload))

  ipcMain.handle('agentOs:getRun', async (_event, runId: string) => await agentOsService.getRun(runId))
  ipcMain.handle('agentOs:approveRun', async (_event, payload) => await agentOsService.approveRun(payload))
  ipcMain.handle('agentOs:rejectRun', async (_event, payload) => await agentOsService.rejectRun(payload))
  ipcMain.handle('agentOs:pauseRun', async (_event, runId: string) => await agentOsService.pauseRun(runId))
  ipcMain.handle('agentOs:resumeRun', async (_event, runId: string) => await agentOsService.resumeRun(runId))
  ipcMain.handle('agentOs:cancelRun', async (_event, runId: string) => await agentOsService.cancelRun(runId))

  ipcMain.handle('agentOs:listArtifacts', async (_event, payload) => await agentOsService.listArtifacts(payload))
  ipcMain.handle('agentOs:openArtifact', async (_event, id: string) => {
    const artifact = await agentOsService.getArtifact(id)
    if (!artifact.localPath) throw new Error('Artifact does not have a local file')
    const error = await shell.openPath(artifact.localPath)
    if (error) throw new Error(error)
    return { ok: true as const }
  })
  ipcMain.handle('agentOs:listEvents', async (_event, payload?: { afterSequence?: number; limit?: number }) =>
    await agentOsService.listEvents(payload?.afterSequence, payload?.limit),
  )

  return agentOsService.subscribe((events) => {
    const window = getWindow()
    if (!window || window.isDestroyed()) return
    window.webContents.send(EVENT_CHANNEL, events)
  })
}
