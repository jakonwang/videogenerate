import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { dialog, type IpcMain } from 'electron'
import { getAppPaths } from '../lib/paths'
import { gmvMaxService } from '../modules/tiktok-gmv-max/service'
import type { GmvMaxDecisionRuleConfig, GmvMaxListEntry, GmvMaxNotificationConfig, GmvMaxPolicyPreset, GmvMaxProductCost, GmvMaxRuleGroup, GmvMaxStoreCost, GmvMaxSupplementalMetric } from '../modules/tiktok-gmv-max/types'

export function registerTiktokGmvMaxIpc(ipcMain: IpcMain) {
  ipcMain.handle('plugin:tiktokGmvMax:getDashboard', async (_event, payload?: { startDate?: string; endDate?: string; includeCreativeMetrics?: boolean }) => await gmvMaxService.getDashboard(payload))
  ipcMain.handle('plugin:tiktokGmvMax:getCampaignWorkspace', async (_event, payload: Parameters<typeof gmvMaxService.getCampaignWorkspace>[0]) => await gmvMaxService.getCampaignWorkspace(payload))
  ipcMain.handle('plugin:tiktokGmvMax:getCampaignPage', async (_event, payload?: Parameters<typeof gmvMaxService.getCampaignPage>[0]) => await gmvMaxService.getCampaignPage(payload))
  ipcMain.handle('plugin:tiktokGmvMax:getCreativePage', async (_event, payload?: Parameters<typeof gmvMaxService.getCreativePage>[0]) => await gmvMaxService.getCreativePage(payload))
  ipcMain.handle('plugin:tiktokGmvMax:getProductPage', async (_event, payload?: Parameters<typeof gmvMaxService.getProductPage>[0]) => await gmvMaxService.getProductPage(payload))
  ipcMain.handle('plugin:tiktokGmvMax:getProductCostPage', async (_event, payload?: Parameters<typeof gmvMaxService.getProductCostPage>[0]) => await gmvMaxService.getProductCostPage(payload))
  ipcMain.handle('plugin:tiktokGmvMax:getProductCost', async (_event, payload: Parameters<typeof gmvMaxService.getProductCost>[0]) => await gmvMaxService.getProductCost(payload))
  ipcMain.handle('plugin:tiktokGmvMax:exportProductCosts', async (_event, payload?: Parameters<typeof gmvMaxService.exportProductCosts>[0]) => await gmvMaxService.exportProductCosts(payload))
  ipcMain.handle('plugin:tiktokGmvMax:importProductCosts', async (_event, payload: Parameters<typeof gmvMaxService.importProductCosts>[0]) => await gmvMaxService.importProductCosts(payload))
  ipcMain.handle('plugin:tiktokGmvMax:getListEntryPage', async (_event, payload?: Parameters<typeof gmvMaxService.getListEntryPage>[0]) => await gmvMaxService.getListEntryPage(payload))
  ipcMain.handle('plugin:tiktokGmvMax:getActionPage', async (_event, payload?: Parameters<typeof gmvMaxService.getActionPage>[0]) => await gmvMaxService.getActionPage(payload))
  ipcMain.handle('plugin:tiktokGmvMax:getOutcomePage', async (_event, payload?: Parameters<typeof gmvMaxService.getOutcomePage>[0]) => await gmvMaxService.getOutcomePage(payload))
  ipcMain.handle('plugin:tiktokGmvMax:getAuditPage', async (_event, payload?: Parameters<typeof gmvMaxService.getAuditPage>[0]) => await gmvMaxService.getAuditPage(payload))
  ipcMain.handle('plugin:tiktokGmvMax:connect', async (_event, payload?: { name?: string }) => {
    return await gmvMaxService.connect({ name: String(payload?.name || '').trim() || undefined })
  })
  ipcMain.handle('plugin:tiktokGmvMax:disconnect', async (_event, payload: { connectionId: string }) => {
    return await gmvMaxService.disconnect(String(payload?.connectionId || ''))
  })
  ipcMain.handle('plugin:tiktokGmvMax:reconnect', async (_event, payload: { connectionId: string }) => {
    return await gmvMaxService.reconnect(String(payload?.connectionId || ''))
  })
  ipcMain.handle('plugin:tiktokGmvMax:sync', async () => await gmvMaxService.syncAll())
  ipcMain.handle('plugin:tiktokGmvMax:syncAccounts', async () => await gmvMaxService.syncAccountsAndStores())
  ipcMain.handle('plugin:tiktokGmvMax:syncCampaigns', async () => await gmvMaxService.syncCampaigns())
  ipcMain.handle('plugin:tiktokGmvMax:syncCatalogs', async () => await gmvMaxService.syncCatalogs())
  ipcMain.handle('plugin:tiktokGmvMax:runSyncJob', async (event, payload: { action?: 'data' | 'catalog' }) => {
    const action = payload?.action === 'catalog' ? 'catalog' : 'data'
    void gmvMaxService.runSyncJob(
      { action },
      (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('plugin:tiktokGmvMax:syncProgress', progress)
      },
    ).catch(() => undefined)
    const started = await gmvMaxService.getLatestSyncJob()
    return started?.action === action ? started : { action, status: 'running' as const }
  })
  ipcMain.handle('plugin:tiktokGmvMax:getSyncJob', async (_event, payload: { jobId: string }) => await gmvMaxService.getSyncJob(payload))
  ipcMain.handle('plugin:tiktokGmvMax:getSopWorkspace', async () => await gmvMaxService.getSopWorkspace())
  ipcMain.handle('plugin:tiktokGmvMax:getCommandCenter', async () => {
    const workspace = await gmvMaxService.getSopWorkspace()
    const stores = [...new Map(workspace.instances.map((item) => [item.storeId, item.storeName])).entries()].map(([id, name]) => ({ id, name }))
    return {
      stores,
      decisions: workspace.decisions,
      decisionSummary: workspace.decisionSummary,
      freshness: workspace.freshnessSummary,
      latestSyncJob: workspace.latestSyncJob,
      generatedAt: workspace.generatedAt,
    }
  })
  ipcMain.handle('plugin:tiktokGmvMax:runSopAutomation', async (_event, payload?: Parameters<typeof gmvMaxService.runSopAutomation>[0]) => await gmvMaxService.runSopAutomation(payload))
  ipcMain.handle('plugin:tiktokGmvMax:startSop', async (_event, payload: Parameters<typeof gmvMaxService.startSop>[0]) => await gmvMaxService.startSop(payload))
  ipcMain.handle('plugin:tiktokGmvMax:updateSop', async (_event, payload: Parameters<typeof gmvMaxService.updateSop>[0]) => await gmvMaxService.updateSop(payload))
  ipcMain.handle('plugin:tiktokGmvMax:completeSopTask', async (_event, payload: Parameters<typeof gmvMaxService.completeSopTask>[0]) => await gmvMaxService.completeSopTask(payload))
  ipcMain.handle('plugin:tiktokGmvMax:saveSupplementalMetrics', async (_event, payload: Partial<GmvMaxSupplementalMetric> & { campaignId: string; statDate: string }) => await gmvMaxService.saveSupplementalMetrics(payload))
  ipcMain.handle('plugin:tiktokGmvMax:importSupplementalMetrics', async (_event, payload: { csv: string }) => await gmvMaxService.importSupplementalMetrics(payload))
  ipcMain.handle('plugin:tiktokGmvMax:exportSupplementalMetricsTemplate', async () => await gmvMaxService.exportSupplementalMetricsTemplate())
  ipcMain.handle('plugin:tiktokGmvMax:createSopInterventionDraft', async (_event, payload: Parameters<typeof gmvMaxService.createSopInterventionDraft>[0]) => await gmvMaxService.createSopInterventionDraft(payload))
  ipcMain.handle('plugin:tiktokGmvMax:recordExternalSopIntervention', async (_event, payload: Parameters<typeof gmvMaxService.recordExternalSopIntervention>[0]) => await gmvMaxService.recordExternalSopIntervention(payload))
  ipcMain.handle('plugin:tiktokGmvMax:verifyExternalSopIntervention', async (_event, payload: Parameters<typeof gmvMaxService.verifyExternalSopIntervention>[0]) => await gmvMaxService.verifyExternalSopIntervention(payload))
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
  ipcMain.handle('plugin:tiktokGmvMax:retryWinnerDraft', async (_event, payload: { id: string }) => await gmvMaxService.retryWinnerDraft(payload))
  ipcMain.handle('plugin:tiktokGmvMax:getReport', async (_event, payload: { campaignId: string }) => {
    return await gmvMaxService.getReport(String(payload?.campaignId || ''))
  })
  ipcMain.handle('plugin:tiktokGmvMax:evaluate', async (_event, payload?: { campaignId?: string; scope?: 'all' | 'creative' }) => await gmvMaxService.runOptimization(
    Date.now(),
    true,
    String(payload?.campaignId || '').trim() || undefined,
    payload?.scope === 'creative' ? 'creative' : 'all',
  ))
  ipcMain.handle('plugin:tiktokGmvMax:analyzeGrowth', async () => await gmvMaxService.analyzeGrowth())
  ipcMain.handle('plugin:tiktokGmvMax:syncRealtime', async () => await gmvMaxService.syncRealtime())
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
  }) => await gmvMaxService.savePolicy(payload))
  ipcMain.handle('plugin:tiktokGmvMax:approve', async (_event, payload: { id: string }) => {
    return await gmvMaxService.approveRecommendation(String(payload?.id || ''))
  })
  ipcMain.handle('plugin:tiktokGmvMax:approveBatch', async (_event, payload: { ids: string[] }) => {
    return await gmvMaxService.approveRecommendations({ ids: Array.isArray(payload?.ids) ? payload.ids.map(String) : [] })
  })
  ipcMain.handle('plugin:tiktokGmvMax:setEmergencyStop', async (_event, payload: { stopped: boolean; reason?: string }) => {
    return await gmvMaxService.setEmergencyStop({ stopped: Boolean(payload?.stopped), reason: String(payload?.reason || '').trim() || undefined })
  })
  ipcMain.handle('plugin:tiktokGmvMax:reject', async (_event, payload: { id: string }) => {
    return await gmvMaxService.rejectRecommendation(String(payload?.id || ''))
  })
  ipcMain.handle('plugin:tiktokGmvMax:approvePortfolio', async (_event, payload: { id: string }) => {
    return await gmvMaxService.approvePortfolioPlan(String(payload?.id || ''))
  })
  ipcMain.handle('plugin:tiktokGmvMax:rejectPortfolio', async (_event, payload: { id: string }) => {
    return await gmvMaxService.rejectPortfolioPlan(String(payload?.id || ''))
  })
  ipcMain.handle('plugin:tiktokGmvMax:saveStoreCost', async (_event, payload: GmvMaxStoreCost) => await gmvMaxService.saveStoreCost(payload))
  ipcMain.handle('plugin:tiktokGmvMax:saveProductCost', async (_event, payload: GmvMaxProductCost) => await gmvMaxService.saveProductCost(payload))
  ipcMain.handle('plugin:tiktokGmvMax:removeProductCost', async (_event, payload: { id: string }) => await gmvMaxService.removeProductCost(String(payload?.id || '')))
  ipcMain.handle('plugin:tiktokGmvMax:saveRuleGroup', async (_event, payload: GmvMaxRuleGroup) => await gmvMaxService.saveRuleGroup(payload))
  ipcMain.handle('plugin:tiktokGmvMax:removeRuleGroup', async (_event, payload: { id: string }) => await gmvMaxService.removeRuleGroup(String(payload?.id || '')))
  ipcMain.handle('plugin:tiktokGmvMax:bindRuleGroup', async (_event, payload: { campaignId: string; ruleGroupId: string }) => await gmvMaxService.bindRuleGroup(payload))
  ipcMain.handle('plugin:tiktokGmvMax:unbindRuleGroup', async (_event, payload: { campaignId: string }) => await gmvMaxService.unbindRuleGroup(String(payload?.campaignId || '')))
  ipcMain.handle('plugin:tiktokGmvMax:saveListEntry', async (_event, payload: GmvMaxListEntry) => await gmvMaxService.saveListEntry(payload))
  ipcMain.handle('plugin:tiktokGmvMax:removeListEntry', async (_event, payload: { id: string }) => await gmvMaxService.removeListEntry(String(payload?.id || '')))
  ipcMain.handle('plugin:tiktokGmvMax:backtest', async (_event, payload?: { campaignId?: string; days?: number }) => await gmvMaxService.runBacktest(payload))
  ipcMain.handle('plugin:tiktokGmvMax:rollback', async (_event, payload: { id: string }) => await gmvMaxService.rollbackAction(String(payload?.id || '')))
  ipcMain.handle('plugin:tiktokGmvMax:saveNotificationConfig', async (_event, payload: GmvMaxNotificationConfig) => await gmvMaxService.saveNotificationConfig(payload))
}
