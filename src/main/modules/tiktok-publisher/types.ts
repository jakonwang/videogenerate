export type CreatokPublishState = 'draft' | 'prechecking' | 'ready' | 'uploading' | 'queued' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled' | 'result_unknown'

export type CreatokMusic = { id: string; title: string; author?: string; url?: string; duration?: number | string; cover_url?: string; play_url?: string }
export type CreatokConnection = { uid: string; name: string; timezone?: string; capabilities?: Record<string, unknown> }
export type CreatokProduct = { id: string; title: string; imageUrl?: string }
export type CreatokPrecheck = { ok: boolean; errors?: string[]; warnings?: string[] }

export type CreatokPublishVariant = {
  status: 'pending' | 'rendering' | 'ready' | 'failed'
  /** 0 = 原版（不改视频，只用原文案）；其余按序号决定微调幅度 */
  index: number
  /** 改视频前的原始文件 */
  originalVideoPath: string
  video: boolean
  caption: boolean
  error?: string
}

export type CreatokPublishLocalize = {
  status: 'pending' | 'rendering' | 'ready' | 'failed'
  language: 'vi' | 'th' | 'id' | 'ms' | 'en'
  voice: 'female' | 'male'
  /** 原声：压低当背景（duck）或去掉（mute） */
  originalAudio: 'duck' | 'mute'
  /** 把原片底部字幕区域模糊掉再压新字幕 */
  coverOldSubtitles: boolean
  originalVideoPath: string
  /** 原片里没有说话：只翻译了标题和描述，视频没改 */
  noSpeech?: boolean
  /** 处理到哪一步，界面显示用 */
  stage?: 'recognizing' | 'translating' | 'voicing' | 'rendering'
  error?: string
}

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
  /** Local product (product library) this video belongs to. */
  localProductId?: string
  /** Content hub reference of the source output, e.g. `clone:<id>`. */
  sourceRef?: string
  createdBy?: 'user' | 'ai_producer'
  /** 矩阵发布：同一批分发出来的任务共用一个批次号 */
  matrixBatchId?: string
  /** 矩阵发布：这条是哪个源任务分发出来的 */
  matrixSourceId?: string
  /** 矩阵发布：每个号一个不重复的版本。pending/rendering 时不能提交。 */
  variant?: CreatokPublishVariant
  /** 多语言版：这条是某个视频的外语版本。pending/rendering 时不能提交。 */
  localize?: CreatokPublishLocalize
  /** GeeLark 发布完成后的作品链接 */
  geelarkShareLink?: string
  createdAt: number
  updatedAt: number
}
