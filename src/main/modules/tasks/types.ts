import type { VideoPlan } from '../random/engine'

export type TaskStatus = 'queued' | 'running' | 'paused' | 'done' | 'error' | 'skipped' | 'cancelled'

export type VideoTask = {
  id: string
  createdAt: number
  productId: string
  templateId: string
  outDir: string
  outPath: string
  plan: VideoPlan
  hash: string
  /** 混剪工作台生成的任务：记录公式、钩子与文案，供任务列表展示和后续效果回流分析 */
  mix?: {
    mode: 'auto' | 'ai'
    formulaId: string
    formulaName: string
    hookClipId: string
    clipIds: string[]
    title: string
    voiceover: string
    hookStyle?: string
    language: string
  }
  status: TaskStatus
  progress: number
  /** 单条渲染耗时（ms） */
  renderMs?: number
  /** 本批次 CSV 报表路径（写入后可用于 UI “打开报表”） */
  reportPath?: string
  error?: string
  logs: string[]
}

export type TaskEvent =
  | { type: 'task:update'; task: VideoTask }
  | { type: 'queue:stats'; stats: { size: number; pending: number; concurrency?: number; paused?: boolean } }

