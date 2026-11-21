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
  /** 复刻（电脑端同款的复刻项目）：电脑和服务器各自生成，项目在两边同步（见 ./cloneWorkspace.ts） */
  cloneWorkspaces: 'clone-workspaces',
  producerChats: 'producer-chats',
  videoToolRuns: 'video-tool-runs',
  publishRecords: 'publish-records',
  gmvDigest: 'gmv-digest',
  gmvDecisions: 'gmv-decisions',
  businessDigest: 'business-digest',
  assets: 'assets',
  /** 素材库里的文件夹（空文件夹、回收站里的文件夹）；有素材的文件夹由素材的 folder 路径自然得出 */
  assetFolders: 'asset-folders',
  creativeRequests: 'creative-requests',
  brand: 'brand',
  templates: 'templates',
  /** 生产中心（见 ./production.ts） */
  mixPools: 'mix-pools',
  mixFormulas: 'mix-formulas',
  mixPoolEdits: 'mix-pool-edits',
  mixPoolImports: 'mix-pool-imports',
  mixOrders: 'mix-orders',
  desktopStatus: 'desktop-status',
  /** 图生视频（参考图替换 → 视频，见 apps/mobile/src/lib/livePhoto.ts） */
  livePhotoItems: 'live-photo-items',
  /** 商品记忆（每个商品一条，记录 id = 云端商品 id） */
  productMemory: 'product-memory',
  /** 复刻任务分组 */
  cloneGroups: 'clone-groups',
  /** 图生图（商品图素材）：拆解视频得到的原图和 AI 衍生图 */
  imageMaterials: 'image-materials',
  /** 图生图：拆解视频批次 */
  imageMaterialBatches: 'image-material-batches',
  /** 图生图：提示词版本 */
  imageMaterialPrompts: 'image-material-prompts',
  /** 每日 / 每周简报（id = kind_周期，同一周期只留一条） */
  briefs: 'briefs',
  /** 上架助手：导出店小秘 Excel 的类目配置（一条，id 固定为 config） */
  listingExportConfig: 'listing-export-config',
  /** 商品图水印：保存的水印模板 */
  watermarkTemplates: 'watermark-templates',
  /** 商品替换：提示词版本 */
  replacePrompts: 'replace-prompts',
  /** 商品替换：批次（结果是 generations 里 purpose=product-replace 的记录） */
  replaceBatches: 'replace-batches',
  /** 选品方案（见 ./research.ts） */
  prSchemes: 'pr-schemes',
  prTasks: 'pr-tasks',
  prResults: 'pr-results',
  prStatus: 'pr-status',
  prRequests: 'pr-requests',
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
  /** 上架商品图（和电脑端一样 5 张：第 1 张主图，后 4 张参考主图生成） */
  listingImages?: Array<{ jobId?: string; fileId?: string; status: SyncJobState; error?: string }>
  /** 生成状态（电脑端同名）：草稿 / 生成中 / 已完成 / 失败 */
  generationStatus?: 'idle' | 'generating' | 'done' | 'failed'
  generationError?: string
  createdAt: number
}

/** AI 生成的素材（商品图 / 图生视频），进审核收件箱 */
export type SyncGeneration = {
  kind: 'image' | 'video'
  purpose: 'product-image' | 'image-to-video' | 'clone' | 'product-replace' | 'product-watermark' | 'model' | 'creative' | import('./videoTools').VideoToolKind
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
  /** 审核收件箱（和电脑端一样）：不通过时是「要重做」还是「丢弃」、原因和备注、处理时间 */
  decision?: 'redo' | 'discarded'
  reason?: string
  note?: string
  decidedAt?: number
  createdAt: number
}

/** 素材库：用户自己上传、可反复使用的视频 / 图片 / 音频（文件在同步空间里，计入配额） */
/** 品牌记忆（全账号一条，id 固定为 BRAND_RECORD_ID）：AI 制片人和文案按它写 */
export type SyncBrand = {
  brandName: string
  tone: string
  audience: string
  bannedWords: string[]
  subtitleStyle: string
  watermarkText: string
  notes: string
}

export const BRAND_RECORD_ID = 'brand'

/** 商品记忆：AI 规划这个商品的内容时参考（和电脑端「商品记忆」同一份） */
export type SyncProductMemory = { sellingPoints: string; audience: string; avoid: string; notes: string }

export function emptySyncBrand(): SyncBrand {
  return { brandName: '', tone: '', audience: '', bannedWords: [], subtitleStyle: '', watermarkText: '', notes: '' }
}

/**
 * 混剪模板（和电脑端「模板库」同一份）。网页能编辑、云端能执行的部分放在明面字段；
 * 配音、转场、LUT、贴纸等只在电脑端生效的设置原样放在 desktop 里，网页编辑时不会丢。
 */
/** 模板里的一段（分镜结构） */
export type SyncTemplateSegment = { key: string; min: number; max: number; zoomMin: number; zoomMax: number }

export type SyncTemplate = {
  name: string
  /** 成片总时长（秒） */
  durationSec: { min: number; max: number }
  /** 每个镜头时长（秒） */
  pieceSec: { min: number; max: number }
  /** 画面标题文案：每条视频随机抽一组，首行是标题 */
  titles: string[]
  /** 背景音乐：每条视频随机挑一首 */
  bgmFileIds: string[]
  bgmVolume: number
  /** 画幅统一：完整展示（加黑边）/ 充满屏幕（居中裁切） */
  aspect: 'contain_pad' | 'cover_crop'
  colorGrade: { enabled: boolean; brightness: number; contrast: number; saturation: number }
  /** 随机水平镜像（降低重复） */
  hflip: boolean
  /** 分段结构（如 hook / show / detail），和 segments 的顺序一致 */
  structure?: string[]
  /** 分镜结构：每段的镜头时长和缩放，和电脑端模板的分段设置同一份 */
  segments?: SyncTemplateSegment[]
  /** 电脑端开启了、网页 / 云端不执行的功能名（展示用） */
  desktopOnly?: string[]
  /** 电脑端模板的其余字段，原样保留 */
  desktop?: Record<string, unknown>
  createdAt: number
}

export type SyncAsset = {
  name: string
  kind: 'video' | 'image' | 'audio'
  fileId: string
  mime: string
  size: number
  /** 文件夹，空表示未分类；「 / 」分隔层级（如「AI 成片 / 加水印」） */
  folder?: string
  durationSec?: number
  width?: number
  height?: number
  /** 视频封面（上传时在浏览器 / 手机里截一帧，列表只加载封面，不下载整段视频） */
  posterFileId?: string
  /** 移入回收站的时间；有值时各处不再显示，可在回收站恢复 */
  trashedAt?: number
  createdAt: number
}

/** 素材库文件夹：path 用「 / 」分隔层级（和素材的 folder 相同写法） */
export type SyncAssetFolder = { path: string; createdAt: number; /** 移入回收站的时间；同一次删除的素材 trashedAt 相同 */ trashedAt?: number }

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
  /** 和相邻镜头一起生成的长镜头：本镜头在那段视频里的位置（videoJobId 相同的镜头共用一段视频） */
  take?: { leaderShotId: string; jobId: string; offsetSec: number; durationSec: number; groupDurationSec: number }
  /** 这段视频的结尾画面用的是这个镜头的分镜图（首尾衔接） */
  relayToShotId?: string
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
  /** 复刻任务分组名（空 = 未分组） */
  group?: string
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
  /** 给人看的说明，如「文字水印：Klipmill」「每段 30 秒」 */
  label: string
  inputFileIds: string[]
  /** 原始文件名（和 inputFileIds 一一对应，显示用） */
  inputNames?: string[]
  /** 同一次提交的几个任务共用一个批次号（处理记录按批次显示） */
  batchId?: string
  /** 实际跑的云端任务类型（和 kind 不同时填，如批量字幕的标题用 watermark 叠图） */
  jobKind?: import('./videoTools').VideoToolKind
  /** 提交时的参数（重试失败项时沿用） */
  options?: import('./videoTools').VideoJobOptions
  /** 完成后存进素材库的这个文件夹 */
  archiveFolder?: string
  /** 已存进素材库 */
  archived?: boolean
  /** 链接下载：分享链接、标题、作者；被「图生图」拆过后标记已使用 */
  url?: string
  /** 整段分享文案（小红书等平台解析要用；重试时沿用） */
  shareText?: string
  /** 来源平台（抖音 / TikTok / 小红书 …） */
  platform?: string
  title?: string
  author?: string
  used?: boolean
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

/** 图生图素材：拆解视频得到的原图（origin=original），或 AI 衍生图（origin=derived，生成中时 fileId 为空） */
export type SyncImageMaterial = {
  category: import('../imageMaterials').ImageMaterialCategory
  origin: 'original' | 'derived'
  fileId?: string
  /** 衍生图：云端生成任务 */
  jobId?: string
  status: SyncJobState
  error?: string
  batchId?: string
  /** 来源视频 / 图片名 */
  sourceName?: string
  /** 原图：在视频里的秒数 */
  atSec?: number
  /** 衍生图：从哪张素材来（素材 id），或上传图片的文件 */
  derivedFromId?: string
  sourceFileId?: string
  variantIndex?: number
  usage: 'unused' | 'used'
  boundProductId?: string
  createdAt: number
}

/** 图生图：一批拆解视频（每个视频一个云端拆图任务） */
export type SyncImageMaterialBatch = {
  category: import('../imageMaterials').ImageMaterialCategory
  sources: Array<{ name: string; fileId: string; jobId: string; status: SyncJobState; generatedCount: number; error?: string }>
  createdAt: number
}

/** 提示词版本（图生图、商品替换等工具各一个集合） */
export type SyncPromptVersion = { name: string; version: number; prompt: string; active: boolean; createdAt: number }

/** 商品替换的一个批次：每张场景图 × 每张生成数量 = 一条 generations 记录 */
export type SyncReplaceBatch = {
  productId?: string
  productName: string
  promptVersion: number
  /** 提交时的提示词和商品参考图（重试失败项时沿用） */
  prompt: string
  productFileIds: string[]
  variantCount: number
  items: Array<{ generationId: string; sourceName: string; sourceFileId: string; aspectRatio: '1:1' | '9:16' | '16:9'; exportedAt?: number }>
  createdAt: number
}

/** 商品图水印：保存的透明水印模板（正方形 PNG / WebP） */
export type SyncWatermarkTemplate = { name: string; fileId: string; createdAt: number }
