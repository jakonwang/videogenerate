/**
 * 选品方案（网页版）：方案、方案进度、采集任务和采集结果在电脑端与网页之间的同步格式。
 *
 * - 方案（含 SOP 进度：搜索词、候选、编辑、直播测试记录）两边都能改，按方案的 updatedAt 以后改的为准。
 * - 采集任务和结果由电脑端（连着采集手机）产生并发布；网页要新建 / 取消 / 删除时写请求（pr-requests），电脑执行。
 * - 电脑端局域网服务和已配对手机的在线情况发布在 pr-status。
 */
import type { ProductResearchDevice, ProductResearchResult, ProductResearchScheme, ProductResearchSchemeState, ProductResearchTask } from '../productResearch'

export const RESEARCH_COLLECTIONS = {
  schemes: 'pr-schemes',
  tasks: 'pr-tasks',
  results: 'pr-results',
  status: 'pr-status',
  requests: 'pr-requests',
} as const

export const RESEARCH_STATUS_ID = 'status'
/** 手机 App 自己采集的结果在电脑端归入这个方案 */
export const MOBILE_SCHEME_ID = 'mobile-collect'

export type SyncResearchScheme = { scheme: ProductResearchScheme; state: ProductResearchSchemeState }

export type SyncPrTask = ProductResearchTask

/** 采集结果：图片换成云端文件 */
export type SyncPrResult = Omit<ProductResearchResult, 'imagePath' | 'imageDataUrl'> & { imageFileId?: string }

export type SyncPrStatus = { at: number; serverRunning: boolean; endpoint: string; devices: ProductResearchDevice[] }

export type PrRequest =
  | { action: 'createTask'; keyword: string; schemeId?: string; sort?: 'comprehensive' | 'sales'; targetCount?: number }
  | { action: 'cancelTask'; taskId: string }
  | { action: 'removeTask'; taskId: string }
  | { action: 'removeResults'; resultIds: string[]; schemeId?: string }

export type SyncPrRequest = PrRequest & {
  state: 'pending' | 'done' | 'failed'
  error?: string
  /** createTask：电脑端建好的任务 id */
  taskId?: string
  createdAt: number
}
