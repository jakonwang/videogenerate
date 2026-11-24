/** AI 修图 · 批量换景：云端、网页、软件、手机共用的数据形状和上限 */

export const SCENE_SWAP_MAX_IMAGES = 100
export const SCENE_SWAP_MAX_SCENES = 5
export const SCENE_SWAP_TRIAL_IMAGES = 2
export const SCENE_CATEGORIES = ['街拍', '室内', '户外', '棚拍'] as const

/** keep = 保真（保留原图人物和衣服，只换背景）；blend = 融合（整张重画） */
export type SceneSwapMode = 'keep' | 'blend'
export type SceneSwapSize = 'original' | '3:4' | '1:1' | '9:16'
/** waiting：等用户看完试图再跑；review：质检不确定，等用户决定（这时点数只是冻结） */
export type SceneSwapItemStatus = 'waiting' | 'queued' | 'running' | 'passed' | 'review' | 'failed' | 'rejected'
export type SceneSwapBatchStatus = 'trial' | 'trial_ready' | 'running' | 'paused' | 'done'

export type SceneSwapCheck = { key: 'color' | 'pattern' | 'face' | 'edge' | 'light' | 'frame'; level: 'ok' | 'warn' | 'unknown' }
export const SCENE_REDO_REASONS = ['边缘不干净', '衣服变了', '脸变了', '光线假', '比例不对'] as const

export type SceneSwapScene = { id: string; name: string; category: string; fileId: string; source: 'system' | 'mine' }
export type SceneSwapItem = {
  id: string
  sourceFileId: string
  sourceName: string
  group: string
  sceneId: string
  sceneName: string
  sceneFileId: string
  status: SceneSwapItemStatus
  /** 免费试图 */
  trial: boolean
  outputFileId?: string
  checks: SceneSwapCheck[]
  error?: string
  attempts: number
}
export type SceneSwapBatch = {
  id: string
  title: string
  mode: SceneSwapMode
  size: SceneSwapSize
  matchLight: boolean
  status: SceneSwapBatchStatus
  /** 自动暂停的原因（如点数不足） */
  notice?: string
  items: SceneSwapItem[]
  createdAt: number
  updatedAt: number
}
export type SceneSwapCreateInput = {
  title?: string
  mode: SceneSwapMode
  size: SceneSwapSize
  matchLight: boolean
  images: Array<{ fileId: string; name: string; group?: string }>
  sceneIds: string[]
}
export type SceneSwapInfo = { keepAvailable: boolean; trialsLeft: number; pointsPerImage: number; scenes: SceneSwapScene[] }

/** 按文件名里的款号分组：A108-1.jpg、A108_2.jpg → A108；看不出来的归到「未分款」 */
export function styleGroupOf(fileName: string): string {
  const base = String(fileName || '').replace(/\.[^.]+$/, '').trim()
  const match = /^(.+?)[\s_\-(（]+\d{1,3}[)）]?$/u.exec(base)
  const head = (match?.[1] ?? '').trim()
  if (!head || /^(img|dsc|mmexport|微信图片|wechat|screenshot|image|photo|\d{6,})$/i.test(head)) return '未分款'
  return head.slice(0, 40)
}
