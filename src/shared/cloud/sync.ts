/**
 * 多端同步协议（云端 services/cloud ↔ 桌面端 ↔ 手机端共用）。
 *
 * 每条记录属于一个集合（products、models……），由客户端生成稳定 id。
 * 冲突按 updatedAt 最后写入者胜；删除以墓碑（deleted=true）同步。
 * 图片、视频不进记录，先 PUT /api/v1/files 上传拿到 fileId，再在记录里引用。
 */

export const SYNC_COLLECTION_PATTERN = /^[a-z][a-z0-9-]{1,39}$/
export const SYNC_MAX_PUSH = 200
export const SYNC_MAX_PULL = 500
export const SYNC_MAX_RECORD_BYTES = 256 * 1024
export const SYNC_MAX_FILE_BYTES = 200 * 1024 * 1024

/** 第一阶段同步的集合 */
export const SYNC_COLLECTIONS = {
  products: 'products',
  models: 'models',
  researchTasks: 'research-tasks',
  researchResults: 'research-results',
  listings: 'listings',
  generations: 'generations',
  cloneProjects: 'clone-projects',
  producerChats: 'producer-chats',
  videoToolRuns: 'video-tool-runs',
  publishRecords: 'publish-records',
  gmvDigest: 'gmv-digest',
  gmvDecisions: 'gmv-decisions',
  businessDigest: 'business-digest',
} as const

export type SyncChange<T = unknown> = {
  collection: string
  id: string
  updatedAt: number
  deleted: boolean
  /** 服务端分配；客户端提交时不需要 */
  seq?: number
  data: T | null
}

export type SyncPullResponse = { changes: SyncChange[]; cursor: number; hasMore: boolean }
export type SyncPushResponse = { applied: SyncChange[]; conflicts: SyncChange[]; cursor: number }
export type SyncUploadResponse = { fileId: string; size: number; mime: string }
export type SyncUsageResponse = { records: number; fileBytes: number; quotaBytes: number; cursor: number }

/* ------------------------------------------------------------------ 同步记录的数据形状 */

/** 云端引用的文件（图片 / 视频） */
export type SyncFileRef = { fileId: string; mime: string; width?: number; height?: number }

export type SyncProductType =
  | 'phone_case' | 'earring' | 'necklace' | 'ring' | 'bracelet' | 'clothes' | 'bag' | 'shoes' | 'toy' | 'general'

/** 商品库中可以跨端同步的部分（本地视频片段等大文件不同步） */
export type SyncProduct = {
  name: string
  type: SyncProductType
  remark?: string
  tiktokProductIds?: string[]
  images: SyncFileRef[]
  coverFileId?: string
  createdAt: number
}

/** 模特库中可以跨端同步的部分 */
export type SyncModel = {
  name: string
  gender?: string
  ageRange?: string
  style?: string
  description?: string
  tags?: string[]
  images: SyncFileRef[]
  coverFileId?: string
  createdAt: number
}

/** 一次选品采集（手机上发起的） */
export type SyncResearchTask = {
  keyword: string
  targetCount: number
  collected: number
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  error?: string
  source: 'mobile'
  startedAt: number
  finishedAt?: number
}

/** 采集到的一个商品 */
export type SyncResearchResult = {
  taskId: string
  keyword: string
  title: string
  priceText?: string
  priceValue?: number
  salesText?: string
  salesValue?: number
  rank: number
  capturedAt: number
  image?: SyncFileRef
  /** 已加入商品库时记录商品 id */
  productId?: string
}

/** 上架助手：一个商品的 TikTok 上架文案 */
export type SyncListing = {
  /** 来自商品库时记录商品 id */
  productId?: string
  images: SyncFileRef[]
  category: 'earring' | 'ring' | 'necklace' | 'phone_case' | 'bracelet'
  language: 'zh-CN' | 'en-US' | 'vi-VN'
  sku: string
  price: string
  title: string
  description: string
  generatedAt?: number
  createdAt: number
}

/** AI 生成的素材（商品图 / 图生视频），进审核收件箱 */
export type SyncGeneration = {
  kind: 'image' | 'video'
  purpose: 'product-image' | 'image-to-video' | 'clone' | 'product-replace' | 'product-watermark' | 'model' | import('./videoTools').VideoToolKind
  /** 云端生成任务号 */
  jobId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  productId?: string
  productName?: string
  /** AI 模特：通过后加进这个模特的图片 */
  modelId?: string
  sourceFileId: string
  /** 给人看的说明，如「侧面上身」「缓慢旋转」 */
  label: string
  outputFileId?: string
  outputMime?: string
  error?: string
  review: 'pending' | 'approved' | 'rejected'
  createdAt: number
}

export type SyncJobState = 'queued' | 'running' | 'succeeded' | 'failed'

/** 复刻项目里每个分镜的生成进度 */
export type SyncCloneShotState = {
  frameJobId?: string
  frameStatus?: SyncJobState
  frameFileId?: string
  frameError?: string
  videoJobId?: string
  videoStatus?: SyncJobState
  videoFileId?: string
  videoError?: string
  /** 不放进成片 */
  skip?: boolean
}

/** 手机端复刻项目：对标视频 → 拆解 → 分镜图 → 分镜视频 → 成片 */
export type SyncCloneProject = {
  name: string
  referenceVideoFileId: string
  locale: 'zh-CN' | 'en-US' | 'vi-VN'
  analyzeJobId?: string
  analyzeStatus?: SyncJobState
  analyzeError?: string
  /** CloneAnalysis（src/shared/cloud/clone.ts） */
  analysis?: import('./clone').CloneAnalysis
  productId?: string
  productName?: string
  productImageFileId?: string
  modelId?: string
  modelImageFileId?: string
  shots: Record<string, SyncCloneShotState>
  composeJobId?: string
  composeStatus?: SyncJobState
  composeError?: string
  finalFileId?: string
  createdAt: number
}

/** AI 制片人：一次对话。计划需要用户点「执行」才会运行 */
export type SyncProducerStepState = {
  tool: import('./producer').ProducerToolId
  title: string
  params: Record<string, unknown>
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  error?: string
  /** 结果在哪里看（App 内路由） */
  route?: string
}

export type SyncProducerMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  at: number
  plan?: { summary: string; state: 'proposed' | 'running' | 'done' | 'cancelled'; steps: SyncProducerStepState[] }
}

export type SyncProducerChat = {
  title: string
  messages: SyncProducerMessage[]
  /** 对话里附带的对标视频（复刻用） */
  referenceVideoFileId?: string
  createdAt: number
}

/** 一次视频工具任务（水印 / 字幕 / 切片 / 混剪 / 链接下载），完成后的每个视频也进审核收件箱 */
export type SyncVideoToolRun = {
  kind: import('./videoTools').VideoToolKind
  jobId: string
  status: SyncJobState
  /** 给人看的说明，如「文字水印：TiktokCut」「每段 30 秒」 */
  label: string
  inputFileIds: string[]
  outputs: import('./videoTools').VideoJobOutput[]
  transcript?: string
  error?: string
  createdAt: number
}

/** 发布记录：哪条视频、在哪台手机、发到了哪里 */
export type SyncPublishRecord = {
  fileId: string
  /** 对应的 generations 记录 */
  generationId?: string
  target: 'tiktok' | 'douyin' | 'other' | 'gallery'
  caption?: string
  label: string
  at: number
}

export const SYNC_PRODUCT_TYPE_LABELS: Record<SyncProductType, string> = {
  phone_case: '手机壳',
  earring: '耳饰',
  necklace: '项链',
  ring: '戒指',
  bracelet: '手链',
  clothes: '服装',
  bag: '包袋',
  shoes: '鞋子',
  toy: '玩具',
  general: '通用',
}
