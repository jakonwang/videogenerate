import type { SegmentKey } from '../products/types'

export type SegmentFx = {
  zoom?: { min: number; max: number } // 1.0~1.1
  move?: { x: { min: number; max: number }; y: { min: number; max: number } } // 归一化：-0.1~0.1
  /** 允许该段随机水平镜像（方案阶段 50% 概率命中后渲染追加 hflip） */
  allowHflip?: boolean
}

export type BgmConfig = {
  // 可多选：生成时会从 filePaths 随机挑 1 条作为本次视频 BGM
  filePaths: string[]
  volume: number // 0~1
}

export type TransitionConfig = {
  enabled: boolean
  /**
   * 随机转场池：每个转场点（段与段之间）会从池中随机抽 1 个作为 xfade transition。
   * 为空时回退为 ['fade']。
   */
  pool: Array<
    | 'hardcut'
    | 'fade'
    | 'slideleft'
    | 'slideright'
    | 'pixelize'
    | 'circlecrop'
    | 'wipeup'
    | 'squeezev'
    | 'squeezeh'
  >
  durationSec: { min: number; max: number } // 建议 0.05~0.35（酷炫类可更短）
}

export type AudioConfig = {
  // 原视频原声（segments 的音频）
  // keep: 保留原声；mute: 静音（仍可叠加配音/BGM）
  source?: 'keep' | 'mute'
  // BGM ducking：当原视频有音频时自动压低 BGM（更像真人剪辑）
  ducking: { enabled: boolean; amountDb: number } // amountDb 建议 10~18
}

export type SubtitleConfig = {
  enabled: boolean
  // 空行分隔不同字幕；同一条字幕允许多行（将原样写入 textfile）
  pool: string[]
  // drawtext 安全区参数（默认居中偏上）
  x?: string
  y?: string
  fontSize?: number
}

// 画面标题（仅烧录到画面，不生成配音；与 TTS 配音相互独立）
export type TitleOverlayConfig = {
  enabled: boolean
  /**
   * 文案池：每条视频随机抽 **1 组**。每组字符串内首行为标题，其余行为符号装饰行（可含换行）。
   * UI 以「组间空一行」编辑；勿按行打散抽签。
   */
  textPool: string[]
}

// 动态 TTS（Edge TTS）：可选配音；不应替代「仅标题」能力
export type TtsConfig = {
  enabled: boolean
  // 文案池：每条视频随机抽 1 条（仅当启用配音时使用）
  textPool: string[]
  // Edge TTS voice，例如：zh-CN-XiaoxiaoNeural / zh-CN-YunxiNeural
  voice: string
  // rate/pitch/volume 允许传 Edge SSML 的相对值（如 +10% / -5% / default）
  rate?: string
  pitch?: string
  // ttsVolume 是合成出来的音频本身的 volume（Edge 侧参数），不是混音音量
  ttsVolume?: string
  // 混音音量（0~1）
  mixVolume: number
  // true: 保留原声并压低（突出配音）；false: 直接用配音替代整段音频
  keepOriginal: boolean
}

// ASS 字幕（高级排版）：根据 TTS 文案与音频时长生成 .ass 并烧录
export type AssSubtitleConfig = {
  enabled: boolean
  // 字体名（与 libass 命中名一致）；默认 Noto Sans SC，多语言见 fontResolve / requirements
  fontName: string
  fontSize: number
  // 样式预设：黄底黑字（更像带货贴片）/ 白字阴影
  preset: 'yellow_box' | 'white_shadow'
  // 画面标题：Alignment=8 TopCenter，离顶部距离
  marginV: number
  // 配音同步字幕：Alignment=2 BottomCenter，离画面底部距离（像素）
  ttsMarginV: number
}

export type RemixJitterConfig = {
  // 速度微扰：每段随机取一个 speed（1.0 表示不变），用于更像真人剪辑且降低重复检测
  speed?: { enabled: boolean; range: { min: number; max: number } } // 建议 0.98~1.02
  // 轻量色彩微扰：每段随机扰动（值越小越自然）
  color?: {
    enabled: boolean
    brightness: { min: number; max: number } // -0.08~0.08（建议 -0.02~0.02）
    contrast: { min: number; max: number } // 0.85~1.15（建议 0.98~1.02）
    saturation: { min: number; max: number } // 0.85~1.25（建议 0.98~1.05）
    hueDeg: { min: number; max: number } // -15~15（建议 -2~2）
  }
}

/** 手动调色：作为基础值，叠加在色彩微扰之前（eq 滤镜） */
export type ColorGradeConfig = {
  enabled: boolean
  /** -1~1，默认 0 */
  brightness: number
  /** -2~2，默认 1 */
  contrast: number
  /** 0~3，默认 1 */
  saturation: number
}

export type AspectUnifyMode = 'contain_pad' | 'cover_crop'

export type Lut3dConfig = {
  /** 选择的 .cube 文件名（位于 resources/luts/） */
  fileName: string
}

export type StickerConfig = {
  /** 贴纸引用（带来源），如 `bundled:star.png` / `user:heart.webp` */
  ref?: string
  /** 选择的贴纸文件名（位于 resources/stickers/） */
  fileName: string
  /** 贴纸高度（px），按高缩放保持等比 */
  heightPx: number
}

export type Template = {
  id: string
  name: string
  meta?: {
    source?: 'clone_blueprint'
    cloneProjectId?: string
    hookType?: string
    productCategory?: string
    rhythm?: {
      avgShotDurationSec?: number
      cutDensity?: string
      first3SecShotCount?: number
      hasFastCut?: boolean
    }
    visualStyle?: {
      scene?: string
      lighting?: string
      cameraStyle?: string
      movementStyle?: string
      realismStyle?: string
    }
  }
  structure: SegmentKey[]
  /** follow_product：模板页按当前产品段位自动补段；fixed：保持模板自身结构（适合样片分析模板） */
  segmentSyncMode?: 'follow_product' | 'fixed'
  totalDurationSec: { min: number; max: number }
  // 安全区裁剪：默认跳过无效片头
  skipStartSec?: number
  segmentDurationSec: Partial<Record<SegmentKey, { min: number; max: number }>>
  segmentFx?: Partial<Record<SegmentKey, SegmentFx>>
  randomizeOrder?: { mode: 'none' | 'partial'; keepFirstCount?: number } // partial: 保留前 N 段，其余打乱
  // 背景音乐（可选）
  bgm?: BgmConfig | null
  // 旧字段（已废弃）：drawtext 随机字幕池
  subtitle?: SubtitleConfig
  // 画面标题文案池（无配音）
  titleOverlay?: TitleOverlayConfig | null
  // Edge-TTS 配音（可选）
  tts?: TtsConfig
  // ASS 字幕（替代 drawtext）
  assSubtitle?: AssSubtitleConfig
  transition?: TransitionConfig
  audio?: AudioConfig
  jitter?: RemixJitterConfig
  /** 画面调色（全局） */
  colorGrade?: ColorGradeConfig | null
  /** 画幅统一模式：完整展示（pad）/充满屏幕（居中裁切） */
  aspectUnifyMode?: AspectUnifyMode | null
  /** 3D LUT 风格滤镜（可选） */
  lut3d?: Lut3dConfig | null
  /** 彩色贴纸（PNG/WebP，可选；渲染使用 overlay） */
  sticker?: StickerConfig | null
  createdAt: number
  updatedAt: number
}

