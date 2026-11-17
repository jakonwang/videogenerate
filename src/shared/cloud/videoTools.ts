/**
 * 手机端视频工具（第三阶段）：批量水印、批量字幕、直播切片、批量混剪、链接解析下载。
 * 云端任务的参数和输出（云端与手机 App 共用）。
 */

export type VideoToolKind = 'watermark' | 'subtitle' | 'slice' | 'mix' | 'parse-link'

/** 各工具的参数（按工具取用） */
export type VideoJobOptions = {
  /** 水印：文字 / 图片二选一 */
  text?: string
  logoFileId?: string
  position?: 'tl' | 'tr' | 'bl' | 'br' | 'center' | 'bottom' | 'middle'
  opacity?: number
  /** 字幕：识别语言（zh / en / vi，不填自动识别）和字号 */
  language?: string
  fontSize?: number
  /** 切片：每段秒数 */
  segmentSec?: number
  /** 混剪：出几条、每条多长、每个镜头多长、背景音乐 */
  count?: number
  durationSec?: number
  pieceSec?: number
  bgmFileId?: string
}

export type VideoJobOutput = { fileId: string; mime: string; durationSec?: number }

/** 视频工具任务的结果（AiGenerationJob.result） */
export type VideoJobResult = {
  outputs: VideoJobOutput[]
  /** 字幕：识别出的文字 */
  transcript?: { language?: string; text: string; cueCount: number; srtPreview: string }
  /** 链接解析：视频标题 */
  title?: string
}

export const VIDEO_TOOL_LABELS: Record<VideoToolKind, string> = {
  watermark: '批量水印',
  subtitle: '批量字幕',
  slice: '直播切片',
  mix: '批量混剪',
  'parse-link': '链接下载',
}

/** 调用 AI / 付费接口、计入每日额度的工具 */
export const VIDEO_TOOLS_USING_QUOTA: VideoToolKind[] = ['subtitle', 'parse-link']
