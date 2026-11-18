/**
 * 手机端视频工具（第三阶段）：批量水印、批量字幕、直播切片、批量混剪、链接解析下载。
 * 云端任务的参数和输出（云端与手机 App 共用）。
 */

export type VideoToolKind = 'watermark' | 'subtitle' | 'slice' | 'mix' | 'parse-link' | 'frames' | 'live-analyze' | 'live-export'

/** 各工具的参数（按工具取用） */
export type VideoJobOptions = {
  /** 水印：文字 / 图片二选一 */
  text?: string
  logoFileId?: string
  /** 图片水印：宽度占画面宽度的比例（0.05~0.6，默认 0.18）、离边缘的距离占画面宽度的比例（0~0.15，默认 0.02） */
  scale?: number
  margin?: number
  /** 图片水印：整张透明图铺满画面（批量字幕的标题图，网页按 1080×1920 画好） */
  fullFrame?: boolean
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
  /** 混剪（模板）：时长 / 镜头长度取区间内随机值 */
  durationMaxSec?: number
  pieceMaxSec?: number
  /** 混剪（模板）：每条随机抽一组标题烧到画面上（首行标题） */
  titles?: string[]
  /** 混剪（模板）：每条随机挑一首背景音乐，音量 0~1 */
  bgmFileIds?: string[]
  bgmVolume?: number
  /** 混剪（模板）：画幅统一方式、调色、随机镜像 */
  aspect?: 'contain_pad' | 'cover_crop'
  color?: { brightness: number; contrast: number; saturation: number }
  hflip?: boolean
  /** 混剪（按生产中心方案）：clips 按顺序就是镜头，每段从 startSec 起剪 durationSec 秒，只出 1 条 */
  exactShots?: boolean
  /** 混剪（按方案）：画面标题（覆盖 titles） */
  title?: string
  /** 混剪：用的模板名（显示用） */
  templateName?: string
  /** 直播切片导出：要导出的片段和成片样式（和电脑端直播切片同一套） */
  segments?: import('../liveSlicer').LiveSlicerSegment[]
  cutMode?: import('../liveSlicer').LiveSlicerCutMode
  aspectMode?: import('../liveSlicer').LiveSlicerAspect
  resolution?: import('../liveSlicer').LiveSlicerResolution
  fade?: boolean
  normalizeAudio?: boolean
  padding?: number
}

export type VideoJobOutput = { fileId: string; mime: string; durationSec?: number; /** 直播切片：对应的片段 id */ segmentId?: string; /** 拆图：这一帧在视频里的秒数 */ atSec?: number; /** 视频封面（链接下载时截一帧） */ posterFileId?: string }

/** 视频工具任务的结果（AiGenerationJob.result） */
export type VideoJobResult = {
  outputs: VideoJobOutput[]
  /** 字幕：识别出的文字 */
  transcript?: { language?: string; text: string; cueCount: number; srtPreview: string }
  /** 直播切片分析：音量能量和画面切换点 */
  analysis?: import('../liveSlicer').LiveSlicerAnalysis
  /** 链接解析：视频标题、作者 */
  title?: string
  author?: string
}

export const VIDEO_TOOL_LABELS: Record<VideoToolKind, string> = {
  watermark: '批量水印',
  subtitle: '批量字幕',
  slice: '直播切片',
  mix: '模板随机混剪',
  'parse-link': '链接下载',
  frames: '视频拆图',
  'live-analyze': '直播切片分析',
  'live-export': '直播切片导出',
}

/** 调用 AI / 付费接口、计入每日额度的工具 */
export const VIDEO_TOOLS_USING_QUOTA: VideoToolKind[] = ['subtitle', 'parse-link']
