/**
 * 云端 AI 网关协议（手机 App 使用；平台密钥只保存在云端）。
 */

export const AI_MAX_PROMPT_CHARS = 12_000
export const AI_MAX_IMAGES = 5

export type AiChatRequest = {
  system?: string
  prompt: string
  /** 已同步到云端的图片（/api/v1/files 上传后得到的 fileId），按顺序附在提示词后 */
  imageFileIds?: string[]
  /** 用途标记，用于按功能统计用量，如 listing-title */
  purpose?: string
}

export type AiChatResponse = { content: string; model: string }

/** 图片 / 视频生成任务（云端后台执行，手机轮询结果） */
export type AiGenerationKind = 'image' | 'video' | 'analyze-video' | 'compose' | import('./videoTools').VideoToolKind

export type AiGenerationRequest = {
  kind: AiGenerationKind
  /** image / video 必填；analyze-video、compose 不需要 */
  prompt?: string
  negativePrompt?: string
  /** 参考图 / 首帧（已上传到云端的 fileId）；图生视频必填 */
  imageFileIds?: string[]
  aspectRatio?: '1:1' | '9:16' | '16:9'
  /** 视频时长（秒） */
  durationSec?: number
  purpose?: string
  /** analyze-video：对标视频 */
  videoFileId?: string
  /** analyze-video：脚本语言，如 zh-CN / vi-VN / en-US */
  locale?: string
  /** compose：按顺序拼接的片段（视频或图片）；mix：素材池（durationSec 不用） */
  clips?: Array<{ fileId: string; durationSec: number; /** mix（按方案）：镜头在原视频里的起点 */ startSec?: number }>
  /** 视频工具的参数（水印文字、切片时长、混剪条数等） */
  options?: import('./videoTools').VideoJobOptions
  /** parse-link：分享链接 */
  url?: string
}

export type AiGenerationJob = {
  id: string
  kind: AiGenerationKind
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  purpose?: string
  outputFileId?: string
  outputMime?: string
  error?: string
  /** analyze-video 的拆解结果（CloneAnalysis）；视频工具的结果（VideoJobResult） */
  result?: unknown
  createdAt: number
  updatedAt: number
  /** 排队中的任务在自己那条队列里的位置（1 = 下一个） */
  queuePosition?: number
}

export type AiUsageResponse = {
  usedToday: number
  dailyLimit: number
  resetsAt: number
  /** 服务器复刻：今天向 AI 平台发起的生成次数与上限（0 = 不限） */
  cloneEngine?: { usedToday: number; dailyLimit: number }
}
