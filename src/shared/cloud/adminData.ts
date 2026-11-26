/**
 * 总后台「用户数据」：超级管理员只读查看每个用户在云端的数据（同步记录、文件、生成任务、电脑端经 AI 代理的生成）。
 * 云端 services/cloud/src/adminData.ts 与管理后台 apps/web-next 共用。
 */
import { SYNC_COLLECTIONS } from './sync'

/** 生成记录从哪来 */
export type AdminGenerationSource =
  /** 电脑端（和服务器复刻引擎）经云端 AI 代理发起的图片 / 视频生成 */
  | 'proxy'
  /** 网页 / 手机端在服务器上跑的生成任务（ai_jobs） */
  | 'job'
  /** AI 修图 · 批量换景 */
  | 'scene-swap'

export type AdminGenerationStatus = 'running' | 'succeeded' | 'failed'

export type AdminGeneration = {
  /** source:原始 id，全局唯一 */
  key: string
  source: AdminGenerationSource
  id: string
  userId: string
  account: string
  kind: 'image' | 'video' | 'other'
  /** 给人看的说明：功能名 / 批次名 / 模型 */
  label: string
  prompt: string
  platform: string
  model: string
  /** desktop / web / mobile（只有 AI 代理的记录有） */
  client: string
  status: AdminGenerationStatus
  error: string
  /** 云端文件（产出） */
  outputFileId: string
  outputMime: string
  /** 缩略图（电脑端生成由服务器截一张小图） */
  thumbFileId: string
  /** 平台给的产出链接（会过期，只作参考） */
  outputUrl: string
  createdAt: number
}

export type AdminGenerationQuery = {
  userId?: string
  source?: AdminGenerationSource | ''
  kind?: 'image' | 'video' | ''
  status?: AdminGenerationStatus | ''
  keyword?: string
  page?: number
  pageSize?: number
}

export type AdminDataCollectionStat = { collection: string; count: number; deleted: number; lastUpdatedAt: number }

export type AdminUserDataSummary = {
  userId: string
  collections: AdminDataCollectionStat[]
  files: { count: number; bytes: number; images: number; videos: number; audios: number; others: number }
  generations: Record<AdminGenerationSource, { total: number; failed: number }>
  lastActivityAt: number
}

export type AdminDataRecord = { collection: string; id: string; updatedAt: number; deleted: boolean; data: unknown }

export type AdminDataFile = { fileId: string; mime: string; size: number; createdAt: number }

/** 签名链接（相对云端地址），有效期内不需要登录就能打开 */
export type AdminFileLinks = { links: Record<string, string>; mimes: Record<string, string>; expiresAt: number }

/* ------------------------------------------------------------------ 集合分组（后台浏览用） */

type Collection = (typeof SYNC_COLLECTIONS)[keyof typeof SYNC_COLLECTIONS]

export const ADMIN_DATA_GROUPS: Array<{ key: string; title: string; collections: Array<{ collection: Collection; label: string }> }> = [
  {
    key: 'works',
    title: '生成作品',
    collections: [
      { collection: 'generations', label: '生成作品' },
      { collection: 'video-tool-runs', label: '视频工具' },
      { collection: 'live-photo-items', label: '图生视频' },
      { collection: 'image-materials', label: '图生图素材' },
      { collection: 'image-material-batches', label: '拆解批次' },
      { collection: 'replace-batches', label: '商品替换批次' },
      { collection: 'creative-requests', label: '创意需求' },
    ],
  },
  {
    key: 'library',
    title: '商品与素材',
    collections: [
      { collection: 'products', label: '商品库' },
      { collection: 'product-memory', label: '商品记忆' },
      { collection: 'models', label: '模特库' },
      { collection: 'assets', label: '素材库' },
      { collection: 'asset-folders', label: '素材文件夹' },
      { collection: 'brand', label: '品牌资料' },
    ],
  },
  {
    key: 'clone',
    title: '复刻与混剪',
    collections: [
      { collection: 'clone-workspaces', label: '复刻项目' },
      { collection: 'clone-projects', label: '复刻项目（旧）' },
      { collection: 'clone-groups', label: '复刻分组' },
      { collection: 'producer-chats', label: '制片对话' },
      { collection: 'mix-pools', label: '混剪素材池' },
      { collection: 'mix-formulas', label: '混剪公式' },
      { collection: 'mix-pool-edits', label: '素材池编辑' },
      { collection: 'mix-pool-imports', label: '素材池导入' },
      { collection: 'mix-orders', label: '混剪订单' },
    ],
  },
  {
    key: 'research',
    title: '选品研究',
    collections: [
      { collection: 'pr-schemes', label: '选品方案' },
      { collection: 'pr-tasks', label: '选品任务' },
      { collection: 'pr-results', label: '选品结果' },
      { collection: 'pr-requests', label: '选品请求' },
      { collection: 'pr-status', label: '选品状态' },
      { collection: 'research-tasks', label: '调研任务（旧）' },
      { collection: 'research-results', label: '调研结果（旧）' },
    ],
  },
  {
    key: 'publish',
    title: '上架与发布',
    collections: [
      { collection: 'listings', label: '上架商品' },
      { collection: 'listing-export-config', label: '导出配置' },
      { collection: 'publish-records', label: '发布记录' },
    ],
  },
  {
    key: 'business',
    title: '经营简报',
    collections: [
      { collection: 'briefs', label: '日报 / 周报' },
      { collection: 'business-digest', label: '经营摘要' },
      { collection: 'gmv-digest', label: 'GMV 摘要' },
      { collection: 'gmv-decisions', label: 'GMV 决策' },
    ],
  },
  {
    key: 'settings',
    title: '模板与提示词',
    collections: [
      { collection: 'templates', label: '剪辑模板' },
      { collection: 'watermark-templates', label: '水印模板' },
      { collection: 'image-material-prompts', label: '图生图提示词' },
      { collection: 'replace-prompts', label: '商品替换提示词' },
      { collection: 'product-analysis-prompts', label: '商品分析提示词' },
      { collection: 'desktop-status', label: '电脑端状态' },
    ],
  },
]

const LABELS = new Map<string, string>(ADMIN_DATA_GROUPS.flatMap((group) => group.collections.map((item) => [item.collection, item.label] as const)))

export function adminCollectionLabel(collection: string): string {
  return LABELS.get(collection) || collection
}

/** 不在上面分组里的集合（新加了还没起名的）归到「其他」 */
export function adminGroupOf(collection: string): string {
  return ADMIN_DATA_GROUPS.find((group) => group.collections.some((item) => item.collection === collection))?.key ?? 'other'
}

export const ADMIN_GENERATION_SOURCE_LABELS: Record<AdminGenerationSource, string> = {
  proxy: '电脑端生成',
  job: '网页 / 手机生成',
  'scene-swap': 'AI 修图',
}
