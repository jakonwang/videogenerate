/**
 * 生产中心（网页版）：素材池、公式、生产单在电脑端和网页之间的同步格式。
 *
 * - 素材池由电脑端切分、AI 打标后发布（mix-pools，每个商品一条），网页可改镜头角色 / 停用（mix-pool-edits），
 *   也可以上传视频进素材池（mix-pool-imports，电脑端下载后切分打标）。
 * - 网页用和电脑端同一套规划逻辑（src/shared/mixPlanner.ts）出方案、用云端模型写配音文案，
 *   然后下生产单（mix-orders）：电脑在线时由电脑完整渲染（配音、字幕、模板成片）；
 *   电脑不在线时可改用云端简版成片（镜头剪辑 + 标题 + 模板音乐 / 画面，不含配音字幕）。
 */
import type { ClipOrigin, ClipRole, ClipTagStatus, ClipTags, PoolSourceKind, PoolSourceStatus } from '../mixPool'
import type { MixDraft, MixFormula, MixLanguage, MixMode } from '../mixFormula'

export const PRODUCTION_COLLECTIONS = {
  pools: 'mix-pools',
  formulas: 'mix-formulas',
  poolEdits: 'mix-pool-edits',
  poolImports: 'mix-pool-imports',
  orders: 'mix-orders',
  desktopStatus: 'desktop-status',
} as const

/** 电脑端最近一次同步的时间：3 分钟内算在线 */
export const DESKTOP_STATUS_ID = 'desktop'
export const DESKTOP_ONLINE_MS = 3 * 60_000
export type SyncDesktopStatus = { at: number; appVersion?: string; features: string[] }

export type SyncPoolSource = {
  id: string
  fileName: string
  kind: PoolSourceKind
  origin: ClipOrigin
  status: PoolSourceStatus
  error?: string
  clipCount: number
  durationSec?: number
  /** 原视频在云端的副本（云端简版成片要用；太大的不上传） */
  fileId?: string
}

export type SyncPoolClip = {
  id: string
  sourceId: string
  startSec: number
  endSec: number
  durationSec: number
  origin: ClipOrigin
  tagStatus: ClipTagStatus
  tags?: ClipTags
  roleOverride?: ClipRole
  disabled?: boolean
  thumbFileId?: string
}

/** 一个商品的素材池（记录 id = 云端商品 id） */
export type SyncMixPool = {
  productName: string
  sources: SyncPoolSource[]
  clips: SyncPoolClip[]
  /** 电脑端正在切分 / 打标 */
  busy?: boolean
  publishedAt: number
}

/** 电脑端自建 / 从对标视频提取的公式（内置公式两边都有，不同步） */
export type SyncMixFormulas = { formulas: MixFormula[] }

/** 网页对镜头的人工修正（记录 id = 云端商品 id） */
export type SyncMixPoolEdits = { clips: Record<string, { roleOverride: ClipRole | null; disabled: boolean }> }

/** 网页上传进素材池的视频，电脑端下载后切分打标 */
export type SyncMixPoolImport = {
  productId: string
  fileId: string
  name: string
  mime: string
  origin: ClipOrigin
  state: 'pending' | 'done' | 'failed'
  error?: string
  createdAt: number
}

export type MixOrderInput = {
  mode: MixMode
  formulaIds: string[]
  count: number
  language: MixLanguage
  voice: string
  /** 云端模板 id（电脑端换成本地模板） */
  templateId?: string
  keepOriginalAudio: boolean
  allowAiClips: boolean
  sellingPoints?: string
}

export type MixOrderResult = {
  status: 'queued' | 'running' | 'done' | 'error' | 'skipped'
  progress?: number
  outputFileId?: string
  error?: string
}

/** 生产单：网页出好方案后下单，由电脑（完整成片）或云端（简版）执行 */
export type SyncMixOrder = {
  productId: string
  productName: string
  input: MixOrderInput
  drafts: MixDraft[]
  runner: 'desktop' | 'cloud'
  state: 'pending' | 'running' | 'completed' | 'failed'
  /** 与 drafts 一一对应 */
  results?: MixOrderResult[]
  /** 云端简版：每条方案对应的云端任务 id */
  cloudJobIds?: string[]
  error?: string
  createdAt: number
  reportedAt?: number
}

export const MIX_ORDER_STATE_LABEL: Record<SyncMixOrder['state'], string> = {
  pending: '等电脑接单',
  running: '生产中',
  completed: '已完成',
  failed: '失败',
}
