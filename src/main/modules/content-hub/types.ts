/**
 * Content hub: one product-centred view over every production line
 * (clone / TikTok creative studio / Live Photo / batch production / publishing),
 * plus the review inbox, lineage, brand memory, health checks and briefs that
 * let the AI producer organise the whole system.
 */

export type ContentLine = 'clone' | 'creative' | 'livephoto' | 'production' | 'publish'

/** `clone:<projectId>`, `creative:<taskId>:<shotId>`, `livephoto:<itemId>`, `production:<taskId>`, `publish:<taskId>`, `product:<id>`, `asset:<id>` */
export type ContentRef = string

export type ContentStatus = 'running' | 'failed' | 'ready' | 'draft'

export type ContentItem = {
  ref: ContentRef
  line: ContentLine
  /** Owning project / task, used to open the right workspace. */
  projectRef: ContentRef
  productId?: string
  productName?: string
  title: string
  status: ContentStatus
  /** Stage label when running/failed, e.g. "分镜视频". */
  stage?: string
  error?: string
  progress?: number
  mediaPath?: string
  mediaType?: 'video' | 'image' | 'livephoto'
  previewPath?: string
  route: string
  sourceRef?: ContentRef
  createdAt: number
  updatedAt: number
}

export type PerformanceVerdict = 'winner' | 'average' | 'weak' | 'unproven'

/** Which GMV Max creative a finished video became once it was published. */
export type ContentPerformanceLink = {
  ref: ContentRef
  creativeId: string
  creativeName: string
  method: 'auto' | 'manual'
  /** 0-1 caption similarity of an auto match. */
  confidence?: number
  linkedAt: number
}

export type ContentPerformance = {
  creativeId: string
  creativeName: string
  method: 'auto' | 'manual'
  confidence?: number
  spend: number
  revenue: number
  orders: number
  roi: number
  verdict: PerformanceVerdict
  /** 成交额 × 毛利率 − 花费；商品没在 GMV MAX 填成本时没有 */
  profit?: number
}

export type ProductPerformance = {
  windowDays: number
  productRoi: number
  /** 商品成本齐全时才有：毛利率、保本 ROI、近 N 天总利润 */
  marginRate?: number
  breakEvenRoi?: number
  profit?: number
  byRef: Record<ContentRef, ContentPerformance>
  byLine: Array<{ line: ContentLine; measured: number; winners: number; spend: number; revenue: number; orders: number; roi: number }>
  measuredCount: number
  /** Published videos of this product that no creative has been matched to yet. */
  publishedUnlinkedCount: number
  /** Creatives with spend that no local video is matched to, for manual linking. */
  unlinkedCreatives: Array<{ creativeId: string; name: string; spend: number; revenue: number; orders: number; roi: number; profit?: number }>
}

export type ProjectSummary = {
  ref: ContentRef
  line: ContentLine
  title: string
  productId?: string
  productName?: string
  status: ContentStatus
  stage?: string
  progress?: number
  readyCount: number
  failedCount: number
  route: string
  previewPath?: string
  updatedAt: number
}

export type LineageRelation =
  | 'derived_from'
  | 'sent_to'
  | 'archived_as'
  | 'published_as'
  | 'created_by_run'
  | 'product_of'

export type LineageEdge = {
  id: string
  fromRef: ContentRef
  toRef: ContentRef
  relation: LineageRelation
  productId?: string
  meta?: Record<string, unknown>
  createdAt: number
}

export type ReviewDecision = 'pending' | 'approved' | 'redo' | 'discarded'

export type ReviewRecord = {
  ref: ContentRef
  line: ContentLine
  productId?: string
  decision: ReviewDecision
  reason?: string
  note?: string
  archivedAssetId?: string
  firstSeenAt: number
  decidedAt?: number
}

export type ReviewItem = ContentItem & { review: ReviewRecord }

export const REDO_REASONS = [
  'product_mismatch',
  'weird_motion',
  'blurry',
  'bad_composition',
  'off_brand',
  'subtitle_issue',
  'other',
] as const
export type RedoReason = (typeof REDO_REASONS)[number]

export type BrandProfile = {
  brandName: string
  tone: string
  audience: string
  bannedWords: string[]
  subtitleStyle: string
  watermarkText: string
  notes: string
  updatedAt: number
}

export type ProductMemory = {
  productId: string
  sellingPoints: string
  audience: string
  avoid: string
  preferredModelIds: string[]
  notes: string
  updatedAt: number
}

export type FeedbackEntry = {
  id: string
  ref: ContentRef
  line: ContentLine
  productId?: string
  decision: Exclude<ReviewDecision, 'pending'>
  reason?: string
  note?: string
  createdAt: number
}

export type BrandMemoryDb = {
  schemaVersion: 1
  brand: BrandProfile
  products: Record<string, ProductMemory>
  feedback: FeedbackEntry[]
}

export type HealthLevel = 'ok' | 'warning' | 'error'

export type HealthCheckItem = {
  key: string
  level: HealthLevel
  title: string
  detail: string
  route?: string
}

export type HealthReport = {
  checkedAt: number
  level: HealthLevel
  items: HealthCheckItem[]
}

export type BriefItemKind =
  | 'review_pending'
  | 'failed_work'
  | 'health'
  | 'publish_ready'
  | 'publish_failed'
  | 'running'
  | 'suggestion'
  /** Ads / creators / inventory / product signal from the business overview. */
  | 'business'
  | 'growth'

export type BriefItem = {
  kind: BriefItemKind
  level: HealthLevel
  title: string
  detail: string
  route?: string
  /** A ready-made instruction the user can hand to the AI producer with one click. */
  aiPrompt?: string
  count?: number
}

export type LineStats = {
  line: ContentLine
  produced: number
  approved: number
  redo: number
  discarded: number
  published: number
  approvalRate: number
}

export type InsightsReport = {
  generatedAt: number
  rangeDays: number
  lines: LineStats[]
  topRedoReasons: Array<{ reason: string; count: number }>
  topProducts: Array<{ productId: string; productName: string; produced: number; approved: number; published: number }>
  publish: { total: number; published: number; failed: number; draft: number }
  recommendations: string[]
}

export type Brief = {
  id: string
  kind: 'daily' | 'weekly'
  periodKey: string
  createdAt: number
  headline: string
  /** One line of business numbers (ads GMV, ROI, creator GMV) when those modules are connected. */
  metrics?: string
  items: BriefItem[]
  insights?: InsightsReport
  summary?: string
}

export type CostEstimate = {
  modelCalls: number
  accountCredits: number
  minutes: number
  notes: string[]
  dangerousSteps: string[]
}
