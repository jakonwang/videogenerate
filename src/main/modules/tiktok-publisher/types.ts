export type CreatokPublishState = 'draft' | 'prechecking' | 'ready' | 'uploading' | 'queued' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled' | 'result_unknown'

export type CreatokMusic = { id: string; title: string; author?: string; url?: string; duration?: number | string; cover_url?: string; play_url?: string }
export type CreatokConnection = { uid: string; name: string; timezone?: string; capabilities?: Record<string, unknown> }
export type CreatokProduct = { id: string; title: string; imageUrl?: string }
export type CreatokPrecheck = { ok: boolean; errors?: string[]; warnings?: string[] }

export type CreatokPublishTask = {
  id: string
  sourceTaskId?: string
  sourceShotId?: string
  sourceVideoPath: string
  posterPath?: string
  connectionUid?: string
  connectionName?: string
  productId?: string
  productTitle?: string
  productLinkTitle?: string
  videoTitle?: string
  description?: string
  tags?: string[]
  music?: CreatokMusic
  scheduleAt?: string
  timezone?: string
  precheckEnabled?: boolean
  aiGenerated?: boolean
  operationId: string
  idempotencyKey: string
  assetId?: string
  preparedVideo?: unknown
  remoteJobId?: string
  state: CreatokPublishState
  precheck?: CreatokPrecheck
  error?: { kind?: string; reason?: string; message: string; requestId?: string; stage?: string; resultUnknown?: boolean }
  createdAt: number
  updatedAt: number
}
