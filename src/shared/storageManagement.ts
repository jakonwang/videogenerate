export const STORAGE_CATEGORY_IDS = [
  'safe_cache',
  'temporary_files',
  'preview_files',
  'diagnostic_logs',
  'completed_project_artifacts',
  'hermes_runtime',
  'hermes_sessions_memory',
  'managed_source_assets',
  'business_records',
  'configuration_credentials',
] as const

export type StorageCategoryId = (typeof STORAGE_CATEGORY_IDS)[number]
export type StorageCategoryRisk = 'safe' | 'caution' | 'destructive' | 'protected'

export type StorageCategorySnapshot = {
  id: StorageCategoryId
  sizeBytes: number
  fileCount: number
  itemCount: number
  risk: StorageCategoryRisk
  available: boolean
  requiresRuntimeStop: boolean
  cleanupAllowed: boolean
  requiresTypedConfirmation: boolean
  backupRequired: boolean
}

export type StorageOverview = {
  categories: StorageCategorySnapshot[]
  totalBytes: number
  scannedAt: number
}

export type StorageCleanupResult = {
  categoryId: StorageCategoryId
  reclaimedBytes: number
  removedFiles: number
  removedItems: number
  backupCreated?: boolean
  warning?: string
  overview: StorageOverview
}

export function storageCleanupConfirmation(categoryId: StorageCategoryId) {
  return `storage-cleanup:${categoryId}`
}

export function storageCleanupChallenge(categoryId: StorageCategoryId) {
  return `DELETE ${categoryId}`
}

export function isStorageCategoryId(value: unknown): value is StorageCategoryId {
  return STORAGE_CATEGORY_IDS.includes(String(value || '') as StorageCategoryId)
}
