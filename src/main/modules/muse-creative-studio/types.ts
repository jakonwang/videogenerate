/** `disabled` = session verified, switched off by the user. */
export type MuseAccountState =
  | 'unchecked' | 'login_required' | 'ready' | 'expired'
  | 'proxy_error' | 'region_blocked' | 'ip_changed' | 'error' | 'disabled'

export type MuseProxyPublic = { protocol: 'http' | 'socks5'; host: string; port: number; username: string; hasPassword: boolean }

export type MuseExit = { ip: string; country: string; museReachable: boolean; museStatus?: number; checkedAt: number }

export type MuseQuota = { plan?: string; weeklyUsedPct: number; weeklyReset?: string; extraUsedPct?: number; extraLeft?: string; /** The panel's own wording around the percentage. */ lines?: string[]; checkedAt: number }

export type MuseAccount = {
  id: string
  name: string
  enabled: boolean
  priority: number
  state: MuseAccountState
  proxy?: MuseProxyPublic
  /** Exit IP the user has accepted; a different one pauses the account. */
  pinnedIp?: string
  exit?: MuseExit
  hasSession: boolean
  /** Out of quota: not used for new jobs until then. A manual test clears it. */
  quotaUntil?: number
  quota?: MuseQuota
  lastError?: string
  updatedAt: number
}

export type MuseJobStage = 'preparing' | 'submitting' | 'generating' | 'collecting' | 'downloading'

export type MuseJobLog = { id: string; level: 'info' | 'success' | 'error'; message: string; time: number }

export type MuseRegion = { x: number; y: number; width: number; height: number; source?: string; revision?: number }

/** Product swap done before the video. */
export type MuseImage = {
  /** Wait for the user before spending Muse quota. */
  review: boolean
  autoLocate: boolean
  prompt: string
  promptVersionId?: string
  promptVersion?: number
  /** Changes with every new submission; answers to older runs are dropped. */
  runId: string
  /** A paid submission is being made. */
  submitting?: boolean
  /** The image provider accepted it; only polling is left. */
  waiting?: boolean
  retryCount: number
  retryLimit: number
  polls?: number
  attempts?: number
  region?: MuseRegion
  /** Left out of the list. */
  state?: Record<string, unknown>
  /** Same for the closing frame of a style reference; left out of the list. */
  lastState?: Record<string, unknown>
  lastRegion?: MuseRegion
  /** No closing frame could be made: the opening frame zoomed in is used instead. */
  lastFailed?: boolean
}

export type MusePromptKind = 'image' | 'video'
export type MusePromptVersion = { id: string; kind: MusePromptKind; name: string; version: number; prompt: string; active: boolean; createdAt: number; updatedAt: number }

export type MuseSettings = { imageRetryLimit: number; autoLocate: boolean }

export type MuseCreateInput = {
  imagePaths: string[]
  prompt: string
  durationSec: number
  aspect: string
  accountId?: string
  productId?: string
  /** Replace the product in each picture with the chosen one first. */
  swapProduct?: boolean
  reviewImage?: boolean
  /** Copy a reference clip: one video per product, pictures and prompt come from the clip. */
  styleReferenceId?: string
  productIds?: string[]
  /** `first_last` also uploads a closing frame: the opening frame zoomed in. */
  mode?: 'reference' | 'first_last'
  /** More pictures of the product, uploaded with every video of the batch. */
  detailImagePaths?: string[]
  /** Also add pictures of the chosen product from the product library. */
  useProductImages?: boolean
  zoomPercent?: number
}

export type MuseJob = {
  id: string
  /** Position inside its batch. */
  order?: number
  /** Account that ran it last; empty before the first run. */
  accountId: string
  /** Set when the user picked one account. */
  requestedAccountId?: string
  /** Product the video is filed under. */
  productId?: string
  productName?: string
  imagePath: string
  /** Product-swapped picture; used instead of imagePath. */
  preparedImagePath?: string
  image?: MuseImage
  styleReferenceId?: string
  /** Closing frame of the style reference, before and after the product swap. */
  lastFrameSourcePath?: string
  preparedLastFramePath?: string
  /** Product pictures uploaded after the frames. */
  detailImagePaths?: string[]
  /** Set for first/last-frame jobs. */
  zoomPercent?: number
  /** Made from a storyboard frame of a clone project. */
  clone?: { projectId: string; shotId: string; autoReplace: boolean; baseline?: string; status?: 'waiting' | 'done' | 'skipped' | 'failed'; error?: string }
  prompt: string
  /** Exact text typed into Muse. */
  sentPrompt: string
  durationSec: number
  aspect: string
  status: 'swapping' | 'image_review' | 'queued' | 'running' | 'completed' | 'failed' | 'needs_review' | 'cancelled'
  stage: MuseJobStage
  /** True once the send button may have been clicked; such a job is never sent again. */
  submitted: boolean
  /** Queued or running only to read the saved conversation. */
  collect?: boolean
  attempts?: number
  quotaSwitches?: number
  timeline?: { startedAt?: number; sentAt?: number; threadAt?: number; videoAt?: number }
  threadPath?: string
  result?: { videoPath: string; width: number; height: number; durationSec: number; bytes: number }
  error?: string
  posterPath?: string
  subtitleVideoPath?: string
  subtitleCoverPath?: string
  subtitleAppliedAt?: number
  exportedAt?: number
  exportedVideoPath?: string
  /** Left out of the list; see `getJob`. */
  logs?: MuseJobLog[]
  createdAt: number
  updatedAt: number
}

/** What the web and phone see: no proxy, no exit address. */
export type MuseAccountSummary = Pick<MuseAccount, 'id' | 'name' | 'enabled' | 'priority' | 'state' | 'hasSession' | 'quotaUntil' | 'quota' | 'lastError' | 'updatedAt'>

export type MuseQueue = { jobs: MuseJob[]; paused: boolean; concurrency: number; settings: MuseSettings }
