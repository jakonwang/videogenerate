import type { IpcMain } from 'electron'
import { clonePromptTemplateService } from '../modules/clone/promptTemplates'

export function registerClonePromptTemplatesIpc(ipcMain: IpcMain) {
  // Prompt builders read the active templates synchronously from memory, so load them once up front.
  void clonePromptTemplateService.load().catch((error) => {
    console.error('[clone-prompt-templates] failed to load saved templates', error)
  })

  ipcMain.handle('clone:describePromptTemplates', async () => clonePromptTemplateService.describe())
  ipcMain.handle('clone:listPromptTemplates', async (_e, payload: { kind: string; productType?: string }) =>
    clonePromptTemplateService.list(payload),
  )
  ipcMain.handle('clone:listActivePromptTemplateScopes', async (_e, payload: { kind: string }) =>
    clonePromptTemplateService.listActiveScopes(payload),
  )
  ipcMain.handle(
    'clone:savePromptTemplate',
    async (_e, payload: { id?: string; kind: string; productType?: string; name?: string; prompt: string }) =>
      clonePromptTemplateService.save(payload),
  )
  ipcMain.handle('clone:activatePromptTemplate', async (_e, payload: { id: string; kind: string; productType?: string }) =>
    clonePromptTemplateService.activate(payload),
  )
  ipcMain.handle('clone:rollbackPromptTemplate', async (_e, payload: { id: string; kind: string; productType?: string }) =>
    clonePromptTemplateService.rollback(payload),
  )
  ipcMain.handle('clone:removePromptTemplate', async (_e, payload: { id: string }) => clonePromptTemplateService.remove(payload))
}
