import type { ExternalReferenceImagePreparationState } from '../live-photo/service'

export type TiktokCreativeTaskStatus = 'draft' | 'running' | 'requires_manual' | 'completed' | 'failed'

export type TiktokCreativeAccountState = 'unknown' | 'ready' | 'expired' | 'insufficient_credit' | 'error' | 'disabled'

export type TiktokCreativeRemoteStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'paused_auth' | 'paused_error'
export type TiktokCreativeGenerationMode = 'reference_to_video' | 'image_to_video'

export type TiktokCreativeAccount = {
  id: string
  name: string
  priority: number
  enabled: boolean
  state: TiktokCreativeAccountState
  credit?: number
  creditCheckedAt?: number
  lastError?: string
  cookieCount: number
  updatedAt: number
}

export type TiktokCreativeReferenceInput = {
  referenceImagePaths: string[]
  productId: string
  prompt?: string
  promptKind?: 'image' | 'video'
  promptVersionId?: string
  durationSec?: number
  mode?: TiktokCreativeGenerationMode
  zoomPercent?: number
}

export type TiktokCreativeTaskLogLevel = 'info' | 'success' | 'error'

export type TiktokCreativeTaskLog = {
  id: string
  level: TiktokCreativeTaskLogLevel
  message: string
  time: number
}

export type TiktokCreativeRequestTrace = {
  stage: 'upload' | 'create' | 'check'
  method: string
  url: string
  headers: Record<string, string>
  body?: unknown
  capturedAt: number
}

export type TiktokCreativeShotTask = {
  id: string
  shotId: string
  shotIndex: number
  scriptText?: string
  imagePath: string
  prompt: string
  durationSec: number
  status: TiktokCreativeTaskStatus
  downloadDir?: string
  resultVideoPath?: string
  lastError?: string
  logs: TiktokCreativeTaskLog[]
  createdAt: number
  updatedAt: number
  sourceType?: 'reference_image' | 'legacy_clone_shot'
  mode?: TiktokCreativeGenerationMode
  zoomPercent?: number
  firstFramePath?: string
  lastFramePath?: string
  referenceImagePath?: string
  preparedImagePath?: string
  imagePreparation?: ExternalReferenceImagePreparationState
  imageRetryCount?: number
  imageRetryLimit?: number
  imageRetryMode?: 'auto' | 'manual_once'
  imageValidationBypassed?: boolean
  accountId?: string
  officialTaskId?: string
  officialVideoId?: string
  remoteStatus?: TiktokCreativeRemoteStatus
  remoteStatusUpdatedAt?: number
  posterPath?: string
  pollAttempts?: number
  requestTrace?: TiktokCreativeRequestTrace[]
  subtitleVideoPath?: string
  subtitleCoverImagePath?: string
  subtitleJobId?: string
  subtitleAppliedAt?: number
  exportedAt?: number
  exportedVideoPath?: string
  /** Clone shot this shot was made for (clone → tk创意室). */
  sourceCloneShotId?: string
  /** Swap the finished video into that clone shot automatically. */
  cloneBackfill?: TiktokCreativeCloneBackfill
}

export type TiktokCreativeCloneBackfill = {
  /** Content fingerprint of the clone shot's video when sent; auto-swap is skipped if the user changed it since. */
  baselineFingerprint?: string
  status: 'waiting' | 'done' | 'skipped' | 'failed'
  error?: string
  updatedAt: number
}

export type TiktokCreativeTask = {
  id: string
  productId?: string
  productName?: string
  sourceCloneProjectId?: string
  sourceCloneProjectTitle?: string
  status: TiktokCreativeTaskStatus
  totalShots: number
  completedShots: number
  failedShots: number
  waitingShots: number
  shots: TiktokCreativeShotTask[]
  lastError?: string
  logs: TiktokCreativeTaskLog[]
  createdAt: number
  updatedAt: number
}
