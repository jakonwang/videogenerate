import type { BrowserWindow, IpcMain } from 'electron'
import { hermesRuntime } from '../modules/hermes/runtime'
import { hermesAgentService } from '../modules/hermes/service'
import { hermesInstallation } from '../modules/hermes/installation'
import { hermesManagement } from '../modules/hermes/management'
import { dispatchHermesWorkspaceAction, subscribeHermesWorkspaceActions } from '../modules/hermes/workspaceActions'

const EVENT_CHANNEL = 'hermes:event'
const STATUS_CHANNEL = 'hermes:runtimeStatus'
const MANAGEMENT_CHANNEL = 'hermes:managementStatus'
const WORKSPACE_ACTION_CHANNEL = 'hermes:workspaceAction'

export function registerHermesAgentIpc(ipcMain: IpcMain, getWindow: () => BrowserWindow | null) {
  ipcMain.handle('hermes:getRuntimeStatus', async () => hermesAgentService.getRuntimeStatus())
  ipcMain.handle('hermes:getInstallationStatus', async () => await hermesRuntime.getInstallationStatus())
  ipcMain.handle('hermes:installRuntime', async () => await hermesRuntime.install())
  ipcMain.handle('hermes:updateRuntime', async () => await hermesRuntime.updateRuntime())
  ipcMain.handle('hermes:repairRuntime', async () => await hermesRuntime.repair())
  ipcMain.handle('hermes:startRuntime', async () => await hermesRuntime.start())
  ipcMain.handle('hermes:stopRuntime', async () => await hermesRuntime.stop())
  ipcMain.handle('hermes:restartRuntime', async () => await hermesAgentService.restartRuntime())
  ipcMain.handle('hermes:listSessions', async (_event, limit?: number) => await hermesAgentService.listSessions(limit))
  ipcMain.handle('hermes:getModelOptions', async (_event, sessionId?: string) => await hermesAgentService.getModelOptions(sessionId))
  ipcMain.handle('hermes:saveProviderKey', async (_event, payload) => await hermesAgentService.saveProviderKey(payload))
  ipcMain.handle('hermes:selectModel', async (_event, payload) => await hermesAgentService.selectModel(payload))
  ipcMain.handle('hermes:disconnectModelProvider', async (_event, payload) => await hermesAgentService.disconnectModelProvider(payload))
  ipcMain.handle('hermes:saveCustomModel', async (_event, payload) => await hermesAgentService.saveCustomModel(payload))
  ipcMain.handle('hermes:useApplicationModel', async () => await hermesAgentService.useApplicationModel())
  ipcMain.handle('hermes:testModelConnection', async () => await hermesAgentService.testModelConnection())
  ipcMain.handle('hermes:createSession', async (_event, payload) => await hermesAgentService.createSession(payload))
  ipcMain.handle('hermes:resumeSession', async (_event, storedSessionId: string) => await hermesAgentService.resumeSession(storedSessionId))
  ipcMain.handle('hermes:forkSession', async (_event, payload) => await hermesAgentService.forkSession(payload.sessionId, payload.name))
  ipcMain.handle('hermes:closeSession', async (_event, sessionId: string) => await hermesAgentService.closeSession(sessionId))
  ipcMain.handle('hermes:renameSession', async (_event, payload) => await hermesAgentService.renameSession(payload))
  ipcMain.handle('hermes:deleteSession', async (_event, sessionId: string) => await hermesAgentService.deleteSession(sessionId))
  ipcMain.handle('hermes:getHistory', async (_event, sessionId: string) => await hermesAgentService.getHistory(sessionId))
  ipcMain.handle('hermes:sendPrompt', async (_event, payload) => await hermesAgentService.sendPrompt(payload))
  ipcMain.handle('hermes:interruptSession', async (_event, sessionId: string) => await hermesAgentService.interruptSession(sessionId))
  ipcMain.handle('hermes:steerSession', async (_event, payload) => await hermesAgentService.steerSession(payload.sessionId, payload.text))
  ipcMain.handle('hermes:respondClarification', async (_event, payload) =>
    await hermesAgentService.respondClarification(payload.sessionId, payload.requestId, payload.answer),
  )
  ipcMain.handle('hermes:respondApproval', async (_event, payload) =>
    await hermesAgentService.respondApproval(payload.sessionId, payload.choice, payload.all),
  )
  ipcMain.handle('hermes:respondSudo', async (_event, payload) =>
    await hermesAgentService.respondSudo(payload.sessionId, payload.requestId, payload.password),
  )
  ipcMain.handle('hermes:respondSecret', async (_event, payload) =>
    await hermesAgentService.respondSecret(payload.sessionId, payload.requestId, payload.value),
  )
  ipcMain.handle('hermes:getDelegationStatus', async () => await hermesAgentService.getDelegationStatus())
  ipcMain.handle('hermes:setDelegationPaused', async (_event, paused: boolean) => await hermesAgentService.setDelegationPaused(paused))
  ipcMain.handle('hermes:interruptSubagent', async (_event, subagentId: string) => await hermesAgentService.interruptSubagent(subagentId))
  ipcMain.handle('hermes:listBackgroundProcesses', async (_event, sessionId: string) =>
    await hermesAgentService.listBackgroundProcesses(sessionId),
  )
  ipcMain.handle('hermes:stopBackgroundProcess', async (_event, payload) =>
    await hermesAgentService.stopBackgroundProcess(payload?.sessionId, payload?.processId),
  )
  ipcMain.handle('hermes:manageBrowser', async (_event, payload) =>
    await hermesAgentService.manageBrowser({
      action: payload?.action,
      sessionId: payload?.sessionId,
      url: payload?.url,
    }),
  )
  ipcMain.handle('hermes:listEvents', async (_event, afterSequence?: number) => await hermesAgentService.listEvents(afterSequence))
  ipcMain.handle('hermes:listSessionEvents', async (_event, payload) => await hermesAgentService.listSessionEvents(payload || {}))
  ipcMain.handle('hermes:listPendingInputs', async () => await hermesAgentService.listPendingInputs())
  ipcMain.handle('hermes:getGatewayStatus', async () => await hermesManagement.getGatewayStatus())
  ipcMain.handle('hermes:startGateway', async () => await hermesManagement.startGateway())
  ipcMain.handle('hermes:stopGateway', async () => await hermesManagement.stopGateway())
  ipcMain.handle('hermes:restartGateway', async () => await hermesManagement.restartGateway())
  ipcMain.handle('hermes:approvePairing', async (_event, payload) => await hermesManagement.approvePairing(payload))
  ipcMain.handle('hermes:listSkills', async () => await hermesManagement.listSkills())
  ipcMain.handle('hermes:searchSkills', async (_event, payload) => await hermesManagement.searchSkills(payload))
  ipcMain.handle('hermes:inspectSkill', async (_event, identifier: string) => await hermesManagement.inspectSkill(identifier))
  ipcMain.handle('hermes:auditSkill', async (_event, identifier: string) => await hermesManagement.auditSkill(identifier))
  ipcMain.handle('hermes:installSkill', async (_event, identifier: string) => await hermesManagement.installSkill(identifier))
  ipcMain.handle('hermes:updateSkills', async () => await hermesManagement.updateSkills())
  ipcMain.handle('hermes:uninstallSkill', async (_event, name: string) => await hermesManagement.uninstallSkill(name))
  ipcMain.handle('hermes:setSkillEnabled', async (_event, payload) => await hermesManagement.setSkillEnabled(payload.name, payload.enabled))
  ipcMain.handle('hermes:listChannels', async () => await hermesManagement.listChannels())
  ipcMain.handle('hermes:getChannel', async (_event, id: string) => await hermesManagement.getChannel(id))
  ipcMain.handle('hermes:saveChannel', async (_event, payload) => await hermesManagement.saveChannel(payload))
  ipcMain.handle('hermes:connectChannel', async (_event, id: string) => await hermesManagement.connectChannel(id))
  ipcMain.handle('hermes:disconnectChannel', async (_event, id: string) => await hermesManagement.disconnectChannel(id))
  ipcMain.handle('hermes:testChannel', async (_event, id: string) => await hermesManagement.testChannel(id))
  ipcMain.handle('hermes:startChannelPairing', async (_event, id: string) => await hermesManagement.startPairing(id))
  ipcMain.handle('hermes:pollChannelPairing', async (_event, pairingId: string) => await hermesManagement.pollPairing(pairingId))
  ipcMain.handle('hermes:cancelChannelPairing', async (_event, pairingId: string) => hermesManagement.cancelPairing(pairingId))
  ipcMain.handle('hermes:createBackup', async () => await hermesManagement.createBackup())
  ipcMain.handle('hermes:listBackups', async () => await hermesManagement.listBackups())
  ipcMain.handle('hermes:getMemoryStatus', async () => await hermesManagement.getMemoryStatus())
  ipcMain.handle('hermes:getDiagnostics', async () => await hermesManagement.getDiagnostics())
  ipcMain.handle('hermes:openWorkspace', async (_event, payload) =>
    dispatchHermesWorkspaceAction(String(payload?.workspaceId || ''), payload?.entityId, payload?.settingsSection),
  )

  const send = (channel: string, payload: unknown) => {
    const window = getWindow()
    if (!window || window.isDestroyed()) return
    window.webContents.send(channel, payload)
  }
  const unsubscribeEvents = hermesAgentService.subscribe((events) => send(EVENT_CHANNEL, events))
  const unsubscribeStatus = hermesRuntime.subscribe((status) => send(STATUS_CHANNEL, status))
  const unsubscribeManagement = hermesInstallation.subscribe((status) => send(MANAGEMENT_CHANNEL, status))
  const unsubscribeWorkspaceActions = subscribeHermesWorkspaceActions((action) => send(WORKSPACE_ACTION_CHANNEL, action))
  return () => {
    unsubscribeEvents()
    unsubscribeStatus()
    unsubscribeManagement()
    unsubscribeWorkspaceActions()
  }
}
