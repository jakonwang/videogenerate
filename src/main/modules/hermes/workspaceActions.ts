import { randomUUID } from 'node:crypto'
import {
  HERMES_SETTINGS_SECTIONS,
  HERMES_WORKSPACES,
  type HermesSettingsSection,
  type HermesWorkspaceAction,
} from '../../../shared/hermesWorkspace'

type WorkspaceActionListener = (action: HermesWorkspaceAction) => void

const listeners = new Set<WorkspaceActionListener>()

export function listHermesWorkspaces() {
  return HERMES_WORKSPACES.map((item) => ({ ...item }))
}

export function createHermesWorkspaceAction(
  workspaceId: string,
  entityId?: string,
  settingsSection?: string,
): HermesWorkspaceAction {
  const definition = HERMES_WORKSPACES.find((item) => item.id === workspaceId)
  if (!definition) throw new Error('Unknown VideoGenerate workspace')
  const normalizedEntityId = String(entityId || '').trim()
  if (definition.entityParam && !normalizedEntityId) throw new Error(`Workspace ${definition.id} requires an entity identifier`)
  if (normalizedEntityId.length > 200 || /[\\/?#]/.test(normalizedEntityId)) throw new Error('Invalid VideoGenerate entity identifier')
  const normalizedSettingsSection = String(settingsSection || '').trim() as HermesSettingsSection
  if (normalizedSettingsSection && definition.id !== 'settings') throw new Error('Settings sections can only be used with the settings workspace')
  if (normalizedSettingsSection && !HERMES_SETTINGS_SECTIONS.includes(normalizedSettingsSection)) throw new Error('Unknown VideoGenerate settings section')
  return {
    id: randomUUID(),
    workspaceId: definition.id,
    route: {
      name: definition.routeName,
      ...(definition.entityParam ? { params: { [definition.entityParam]: normalizedEntityId } } : {}),
      ...(normalizedSettingsSection ? { query: { section: normalizedSettingsSection } } : {}),
    },
    createdAt: Date.now(),
  }
}

export function dispatchHermesWorkspaceAction(workspaceId: string, entityId?: string, settingsSection?: string) {
  const action = createHermesWorkspaceAction(workspaceId, entityId, settingsSection)
  for (const listener of listeners) listener(action)
  return { action, recipientCount: listeners.size }
}

export function subscribeHermesWorkspaceActions(listener: WorkspaceActionListener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
