/**
 * 云端 AI 网关协议（手机 App 使用；平台密钥只保存在云端）。
 */

export const AI_MAX_PROMPT_CHARS = 12_000
export const AI_MAX_IMAGES = 4

export type AiChatRequest = {
  system?: string
  prompt: string
  /** 已同步到云端的图片（/api/v1/files 上传后得到的 fileId），按顺序附在提示词后 */
  imageFileIds?: string[]
  /** 用途标记，用于按功能统计用量，如 listing-title */
  purpose?: string
}

export type AiChatResponse = { content: string; model: string }

export type AiUsageResponse = { usedToday: number; dailyLimit: number; resetsAt: number }
