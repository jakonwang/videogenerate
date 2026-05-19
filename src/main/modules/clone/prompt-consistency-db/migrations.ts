import { canInitializePromptConsistencyDb, initializePromptConsistencyDb } from './client'

let initialized = false

export function ensurePromptConsistencyDb() {
  if (initialized) return true
  if (!canInitializePromptConsistencyDb()) return false
  initializePromptConsistencyDb()
  initialized = true
  return true
}
