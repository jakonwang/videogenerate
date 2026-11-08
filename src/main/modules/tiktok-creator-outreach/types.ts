import type { StoreType } from './regions'

export type CreatorOutreachAccount = {
  id: string
  name: string
  shopRegion: string
  shopId: string
  storeType: StoreType
  affiliateHost?: string
  authorizationStatus?: 'not_connected' | 'connected' | 'expired' | 'revoked'
  tokenUpdatedAt?: number
  createdAt: number
  updatedAt: number
}

export type TiktokShopApiCredential = {
  appKey: string
  appSecretEncrypted: string
  redirectUri: string
  apiBaseUrl?: string
  apiVersion?: string
}

export type OutreachCampaignStatus = 'draft' | 'ready' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'
export type CreatorSource = 'marketplace' | 'specified' | 'library' | 'competitor_product' | 'competitor_shop' | 'fulfillment'
export type OutreachTaskStatus = 'draft' | 'preview' | 'ready' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'
export type CreatorLibraryEntry = {
  id: string
  accountId: string
  creatorId: string
  creatorName: string
  profileUrl?: string
  tags: string[]
  note?: string
  status: 'active' | 'blocked'
  source?: CreatorSource
  lastInvitedAt?: number
  lastMessagedAt?: number
  createdAt: number
  updatedAt: number
}
export type OutreachTaskProgress = { total: number; completed: number; success: number; failed: number; skipped: number }
export type OutreachTask = {
  id: string
  accountId: string
  source: CreatorSource
  mode: 'invite' | 'message' | 'email' | 'plan_share' | 'plan_cleanup' | 'plan_merge'
  targetCount: number
  batchSize: number
  filters: Record<string, unknown>
  creatorIds: string[]
  creatorNames: string[]
  successfulCreatorIds?: string[]
  failedCreatorIds?: string[]
  skippedCreatorIds?: string[]
  status: OutreachTaskStatus
  progress: OutreachTaskProgress
  currentBatch?: number
  confirmedAt?: number
  lastError?: string
  invitation?: OutreachCampaign['invitation']
  messageTemplate?: string
  messageFilters?: { historyMode: 'all' | 'days'; days?: number; skipCreatorReply?: boolean }
  createdAt: number
  updatedAt: number
}
export type OutreachCampaign = {
  id: string
  accountId: string
  mode: 'invite' | 'message'
  targetCount: number
  batchSize: number
  filters: Record<string, unknown>
  invitation?: { name: string; expiresAt: string; message: string; contentType: string; productIds: string[]; commissionRate?: number; adCommissionRate?: number }
  messageTemplate?: string
  status: OutreachCampaignStatus
  createdAt: number
  updatedAt: number
}

export type OutreachBatchRecord = { id: string; campaignId: string; index: number; creatorIds: string[]; status: 'pending' | 'running' | 'completed' | 'paused' | 'failed' | 'cancelled'; successCount: number; failureCount: number; error?: string }

export type CreatorRow = {
  id: string
  name: string
  followers?: string
  gmv?: string
  itemsSold?: string
  avgVideoViews?: string
  engagementRate?: string
  selected?: boolean
  invited?: boolean
}

export type OutreachBatch = { index: number; total: number; creatorIds: string[]; creatorNames?: string[] }

export type OutreachTemplate = {
  id: string
  name: string
  kind: 'invite' | 'message'
  body: string
  createdAt: number
  updatedAt: number
}

export type OutreachAudit = {
  id: string
  accountId: string
  action: 'read_creators' | 'preview_invite' | 'preview_message' | 'confirm_invite' | 'confirm_message' | 'creators_read' | 'invite_confirmed' | 'message_confirmed' | 'extension_event' | 'task_created' | 'task_confirmed' | 'task_started' | 'task_paused' | 'task_resumed' | 'task_cancelled' | 'task_completed' | 'creator_library' | 'creator_skipped' | 'creator_failed' | 'invite_batch_started' | 'invite_batch_completed'
  status: 'success' | 'failed' | 'cancelled'
  count?: number
  detail?: string
  createdAt: number
}

export type CreatorOutreachDb = {
  version: 2
  apiCredential?: TiktokShopApiCredential
  accounts: CreatorOutreachAccount[]
  templates: OutreachTemplate[]
  audits: OutreachAudit[]
  campaigns?: OutreachCampaign[]
  batches?: OutreachBatchRecord[]
  library?: CreatorLibraryEntry[]
  tasks?: OutreachTask[]
}
