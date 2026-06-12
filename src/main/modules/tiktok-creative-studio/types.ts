export type TiktokCreativeTaskStatus = 'draft' | 'running' | 'requires_manual' | 'completed' | 'failed'

export type TiktokCreativeTaskLogLevel = 'info' | 'success' | 'error'

export type TiktokCreativeTaskLog = {
  id: string
  level: TiktokCreativeTaskLogLevel
  message: string
  time: number
}

export type TiktokCreativeShotTask = {
  id: string
  shotId: string
  shotIndex: number
  scriptText?: string
  imagePath: string
  prompt: string
  durationSec: number
  status: TiktokCreativeTaskStatus
  downloadDir?: string
  resultVideoPath?: string
  lastError?: string
  logs: TiktokCreativeTaskLog[]
  createdAt: number
  updatedAt: number
}

export type TiktokCreativeTask = {
  id: string
  sourceCloneProjectId?: string
  sourceCloneProjectTitle?: string
  status: TiktokCreativeTaskStatus
  totalShots: number
  completedShots: number
  failedShots: number
  waitingShots: number
  shots: TiktokCreativeShotTask[]
  lastError?: string
  logs: TiktokCreativeTaskLog[]
  createdAt: number
  updatedAt: number
}
