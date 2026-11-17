import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { dialog, type IpcMain } from 'electron'
import { getAppPaths } from '../lib/paths'
import { gmvMaxService } from '../modules/tiktok-gmv-max/service'
import { gmvMaxWorkerClient } from '../modules/tiktok-gmv-max/workerClient'
import { startGmvMaxAlertMonitor } from '../modules/tiktok-gmv-max/alertMonitor'
import type { GmvMaxDecisionRuleConfig, GmvMaxListEntry, GmvMaxNotificationConfig, GmvMaxPolicyPreset, GmvMaxProductCost, GmvMaxRuleGroup, GmvMaxStoreCost, GmvMaxSupplementalMetric } from '../modules/tiktok-gmv-max/types'

export function registerTiktokGmvMaxIpc(ipcMain: IpcMain) {
  ipcMain.handle('plugin:tiktokGmvMax:getDashboard', async (_event, payload?: { startDate?: string; endDate?: string; includeCreativeMetrics?: boolean }) => {
    // Desktop alerts start once GMV MAX has been opened, so users who never use it do not pay for the worker.
    startGmvMaxAlertMonitor()
    return await gmvMaxWorkerClient.call('getDashboard', [payload])
  })
  ipcMain.handle('plugin:tiktokGmvMax:getAlerts', async () => await gmvMaxWorkerClient.call('getAlerts'))
  ipcMain.handle('plugin:tiktokGmvMax:getCampaignWorkspace', async (_event, payload: Parameters<typeof gmvMaxService.getCampaignWorkspace>[0]) => await gmvMaxWorkerClient.call('getCampaignWorkspace', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:getCampaignPage', async (_event, payload?: Parameters<typeof gmvMaxService.getCampaignPage>[0]) => await gmvMaxWorkerClient.call('getCampaignPage', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:getCreativePage', async (_event, payload?: Parameters<typeof gmvMaxService.getCreativePage>[0]) => await gmvMaxWorkerClient.call('getCreativePage', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:getProductPage', async (_event, payload?: Parameters<typeof gmvMaxService.getProductPage>[0]) => await gmvMaxWorkerClient.call('getProductPage', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:getProductCostPage', async (_event, payload?: Parameters<typeof gmvMaxService.getProductCostPage>[0]) => await gmvMaxWorkerClient.call('getProductCostPage', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:getProductCost', async (_event, payload: Parameters<typeof gmvMaxService.getProductCost>[0]) => await gmvMaxWorkerClient.call('getProductCost', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:exportProductCosts', async (_event, payload?: Parameters<typeof gmvMaxService.exportProductCosts>[0]) => await gmvMaxWorkerClient.call('exportProductCosts', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:importProductCosts', async (_event, payload: Parameters<typeof gmvMaxService.importProductCosts>[0]) => await gmvMaxWorkerClient.call('importProductCosts', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:getListEntryPage', async (_event, payload?: Parameters<typeof gmvMaxService.getListEntryPage>[0]) => await gmvMaxWorkerClient.call('getListEntryPage', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:getActionPage', async (_event, payload?: Parameters<typeof gmvMaxService.getActionPage>[0]) => await gmvMaxWorkerClient.call('getActionPage', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:getOutcomePage', async (_event, payload?: Parameters<typeof gmvMaxService.getOutcomePage>[0]) => await gmvMaxWorkerClient.call('getOutcomePage', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:getAuditPage', async (_event, payload?: Parameters<typeof gmvMaxService.getAuditPage>[0]) => await gmvMaxWorkerClient.call('getAuditPage', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:getV2Workspace', async (_event, payload?: { storeId?: string }) => await gmvMaxWorkerClient.call('getV2Workspace', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:saveV2Settings', async (_event, payload) => await gmvMaxWorkerClient.call('saveV2Settings', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:recordV2Change', async (_event, payload) => await gmvMaxWorkerClient.call('recordV2Change', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:undoV2Change', async (_event, payload) => await gmvMaxWorkerClient.call('undoV2Change', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:connect', async (_event, payload?: { name?: string }) => {
    return await gmvMaxService.connect({ name: String(payload?.name || '').trim() || undefined })
  })
  ipcMain.handle('plugin:tiktokGmvMax:disconnect', async (_event, payload: { connectionId: string }) => {
    return await gmvMaxService.disconnect(String(payload?.connectionId || ''))
  })
  ipcMain.handle('plugin:tiktokGmvMax:reconnect', async (_event, payload: { connectionId: string }) => {
    return await gmvMaxService.reconnect(String(payload?.connectionId || ''))
  })
  ipcMain.handle('plugin:tiktokGmvMax:sync', async () => await gmvMaxWorkerClient.call('syncAll'))
  ipcMain.handle('plugin:tiktokGmvMax:syncAccounts', async () => await gmvMaxWorkerClient.call('syncAccountsAndStores'))
  ipcMain.handle('plugin:tiktokGmvMax:syncCampaigns', async () => await gmvMaxWorkerClient.call('syncCampaigns'))
  ipcMain.handle('plugin:tiktokGmvMax:syncCatalogs', async () => await gmvMaxWorkerClient.call('syncCatalogs'))
  ipcMain.handle('plugin:tiktokGmvMax:runSyncJob', async (event, payload: { action?: 'data' | 'catalog' }) => {
    const action = payload?.action === 'catalog' ? 'catalog' : 'data'
    return await gmvMaxWorkerClient.startSyncJob(
      { action },
      (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('plugin:tiktokGmvMax:syncProgress', progress)
      },
    )
  })
  ipcMain.handle('plugin:tiktokGmvMax:getSyncJob', async (_event, payload: { jobId: string }) => await gmvMaxWorkerClient.call('getSyncJob', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:getSopWorkspace', async () => await gmvMaxWorkerClient.call('getSopWorkspace'))
  ipcMain.handle('plugin:tiktokGmvMax:getCoachWorkspace', async () => await gmvMaxWorkerClient.call('getCoachWorkspace'))
  ipcMain.handle('plugin:tiktokGmvMax:refreshCoachDecision', async (_event, payload?: Parameters<typeof gmvMaxService.refreshCoachDecision>[0]) => await gmvMaxWorkerClient.call('refreshCoachDecision', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:getCoachRun', async (_event, payload: { id: string }) => await gmvMaxWorkerClient.call('getCoachRun', [String(payload?.id || '')]))
  ipcMain.handle('plugin:tiktokGmvMax:getCommandCenter', async () => await gmvMaxWorkerClient.call('getCommandCenter'))
  ipcMain.handle('plugin:tiktokGmvMax:runSopAutomation', async (_event, payload?: Parameters<typeof gmvMaxService.runSopAutomation>[0]) => await gmvMaxWorkerClient.call('runSopAutomation', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:startSop', async (_event, payload: Parameters<typeof gmvMaxService.startSop>[0]) => await gmvMaxWorkerClient.call('startSop', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:updateSop', async (_event, payload: Parameters<typeof gmvMaxService.updateSop>[0]) => await gmvMaxWorkerClient.call('updateSop', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:completeSopTask', async (_event, payload: Parameters<typeof gmvMaxService.completeSopTask>[0]) => await gmvMaxWorkerClient.call('completeSopTask', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:saveSupplementalMetrics', async (_event, payload: Partial<GmvMaxSupplementalMetric> & { campaignId: string; statDate: string }) => await gmvMaxWorkerClient.call('saveSupplementalMetrics', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:importSupplementalMetrics', async (_event, payload: { csv: string }) => await gmvMaxWorkerClient.call('importSupplementalMetrics', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:exportSupplementalMetricsTemplate', async () => await gmvMaxWorkerClient.call('exportSupplementalMetricsTemplate'))
  ipcMain.handle('plugin:tiktokGmvMax:createSopInterventionDraft', async (_event, payload: Parameters<typeof gmvMaxService.createSopInterventionDraft>[0]) => await gmvMaxWorkerClient.call('createSopInterventionDraft', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:recordExternalSopIntervention', async (_event, payload: Parameters<typeof gmvMaxService.recordExternalSopIntervention>[0]) => await gmvMaxWorkerClient.call('recordExternalSopIntervention', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:verifyExternalSopIntervention', async (_event, payload: Parameters<typeof gmvMaxService.verifyExternalSopIntervention>[0]) => await gmvMaxWorkerClient.call('verifyExternalSopIntervention', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:selectEvidenceAttachment', async () => {
    const selection = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    })
    if (selection.canceled || !selection.filePaths[0]) return null
    const sourcePath = selection.filePaths[0]
    const extension = extname(sourcePath).toLowerCase()
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) throw new Error('Unsupported evidence image format.')
    const sourceStat = await stat(sourcePath)
    if (!sourceStat.isFile() || sourceStat.size > 15 * 1024 * 1024) throw new Error('Evidence image must be smaller than 15 MB.')
    const sha256 = createHash('sha256').update(await readFile(sourcePath)).digest('hex')
    const evidenceDir = join(getAppPaths().dataDir, 'gmv-max', 'evidence')
    await mkdir(evidenceDir, { recursive: true })
    const targetPath = join(evidenceDir, `${sha256}${extension === '.jpeg' ? '.jpg' : extension}`)
    await copyFile(sourcePath, targetPath)
    return { path: targetPath, name: basename(sourcePath), size: sourceStat.size, sha256, importedAt: Date.now() }
  })
  ipcMain.handle('plugin:tiktokGmvMax:retryWinnerDraft', async (_event, payload: { id: string }) => await gmvMaxWorkerClient.call('retryWinnerDraft', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:getReport', async (_event, payload: { campaignId: string }) => {
    return await gmvMaxWorkerClient.call('getReport', [String(payload?.campaignId || '')])
  })
  ipcMain.handle('plugin:tiktokGmvMax:evaluate', async (_event, payload?: { campaignId?: string; scope?: 'all' | 'creative' }) => await gmvMaxWorkerClient.call('runOptimization', [Date.now(), true, String(payload?.campaignId || '').trim() || undefined, payload?.scope === 'creative' ? 'creative' : 'all']))
  ipcMain.handle('plugin:tiktokGmvMax:analyzeGrowth', async () => await gmvMaxWorkerClient.call('analyzeGrowth'))
  ipcMain.handle('plugin:tiktokGmvMax:syncRealtime', async () => await gmvMaxWorkerClient.call('syncRealtime'))
  ipcMain.handle('plugin:tiktokGmvMax:savePolicy', async (_event, payload: {
    campaignId: string
    preset?: GmvMaxPolicyPreset
    automationEnabled?: boolean
    minRoi?: string
    minOrders?: number
    minCompleteDays?: number
    cooldownHours?: number
    dailyBudgetChangeLimitPercent?: number
    promotionAutoExecutionEnabled?: boolean
    targetCpa?: string
    creativeTestBudget?: string
    profitSafetyMarginPercent?: number
    budgetPermission?: boolean
    roiPermission?: boolean
    statusPermission?: boolean
    creativePermission?: boolean
    sessionPermission?: boolean
    shadowMode?: boolean
    pilotEnabled?: boolean
    pauseOnZeroOrders?: boolean
    decisionRules?: Partial<GmvMaxDecisionRuleConfig>
  }) => await gmvMaxWorkerClient.call('savePolicy', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:approve', async (_event, payload: { id: string }) => {
    return await gmvMaxWorkerClient.call('approveRecommendation', [String(payload?.id || '')])
  })
  ipcMain.handle('plugin:tiktokGmvMax:approveBatch', async (_event, payload: { ids: string[] }) => {
    return await gmvMaxWorkerClient.call('approveRecommendations', [{ ids: Array.isArray(payload?.ids) ? payload.ids.map(String) : [] }])
  })
  ipcMain.handle('plugin:tiktokGmvMax:setEmergencyStop', async (_event, payload: { stopped: boolean; reason?: string }) => {
    return await gmvMaxWorkerClient.call('setEmergencyStop', [{ stopped: Boolean(payload?.stopped), reason: String(payload?.reason || '').trim() || undefined }])
  })
  ipcMain.handle('plugin:tiktokGmvMax:reject', async (_event, payload: { id: string }) => {
    return await gmvMaxWorkerClient.call('rejectRecommendation', [String(payload?.id || '')])
  })
  ipcMain.handle('plugin:tiktokGmvMax:approvePortfolio', async (_event, payload: { id: string }) => {
    return await gmvMaxWorkerClient.call('approvePortfolioPlan', [String(payload?.id || '')])
  })
  ipcMain.handle('plugin:tiktokGmvMax:rejectPortfolio', async (_event, payload: { id: string }) => {
    return await gmvMaxWorkerClient.call('rejectPortfolioPlan', [String(payload?.id || '')])
  })
  ipcMain.handle('plugin:tiktokGmvMax:saveStoreCost', async (_event, payload: GmvMaxStoreCost) => await gmvMaxWorkerClient.call('saveStoreCost', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:saveProductCost', async (_event, payload: GmvMaxProductCost) => await gmvMaxWorkerClient.call('saveProductCost', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:removeProductCost', async (_event, payload: { id: string }) => await gmvMaxWorkerClient.call('removeProductCost', [String(payload?.id || '')]))
  ipcMain.handle('plugin:tiktokGmvMax:saveRuleGroup', async (_event, payload: GmvMaxRuleGroup) => await gmvMaxWorkerClient.call('saveRuleGroup', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:removeRuleGroup', async (_event, payload: { id: string }) => await gmvMaxWorkerClient.call('removeRuleGroup', [String(payload?.id || '')]))
  ipcMain.handle('plugin:tiktokGmvMax:bindRuleGroup', async (_event, payload: { campaignId: string; ruleGroupId: string }) => await gmvMaxWorkerClient.call('bindRuleGroup', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:unbindRuleGroup', async (_event, payload: { campaignId: string }) => await gmvMaxWorkerClient.call('unbindRuleGroup', [String(payload?.campaignId || '')]))
  ipcMain.handle('plugin:tiktokGmvMax:saveListEntry', async (_event, payload: GmvMaxListEntry) => await gmvMaxWorkerClient.call('saveListEntry', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:removeListEntry', async (_event, payload: { id: string }) => await gmvMaxWorkerClient.call('removeListEntry', [String(payload?.id || '')]))
  ipcMain.handle('plugin:tiktokGmvMax:backtest', async (_event, payload?: { campaignId?: string; days?: number }) => await gmvMaxWorkerClient.call('runBacktest', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:applyManualChange', async (_event, payload: { campaignId: string; budget?: string | number; roasBid?: string | number; operationStatus?: string }) => await gmvMaxWorkerClient.call('applyManualChange', [payload]))
  ipcMain.handle('plugin:tiktokGmvMax:applyManualChanges', async (_event, payload: { changes: Array<{ campaignId: string; budget?: string | number; roasBid?: string | number; operationStatus?: string }> }) => await gmvMaxWorkerClient.call('applyManualChanges', [{ changes: Array.isArray(payload?.changes) ? payload.changes : [] }]))
  ipcMain.handle('plugin:tiktokGmvMax:rollback', async (_event, payload: { id: string }) => await gmvMaxWorkerClient.call('rollbackAction', [String(payload?.id || '')]))
  ipcMain.handle('plugin:tiktokGmvMax:saveNotificationConfig', async (_event, payload: GmvMaxNotificationConfig) => await gmvMaxWorkerClient.call('saveNotificationConfig', [payload]))
}
