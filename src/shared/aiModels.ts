/**
 * 后台「默认模型」下拉用的图片 / 对话模型清单（视频见 videoModels.ts）。
 * 模型名来自各平台文档（2026-11）；GRS 的对话接口文档写「支持所有模型」，这里只列常用的，其余走「自定义」。
 */
import type { PlatformProfile } from './platformSettings'

export type ModelOption = { platform: PlatformProfile; model: string; label: string }

export const PLATFORM_DISPLAY_NAMES: Record<PlatformProfile, string> = {
  gaorui: '高瑞',
  xibapi: '小扳手',
  grsai: 'GRS.AI',
  ai666: 'AI666',
}

export const IMAGE_MODEL_OPTIONS: ModelOption[] = [
  { platform: 'grsai', model: 'gpt-image-2', label: 'GPT Image 2' },
  { platform: 'grsai', model: 'gpt-image-2-vip', label: 'GPT Image 2 VIP' },
  { platform: 'grsai', model: 'gpt-image-2.5', label: 'GPT Image 2.5' },
  { platform: 'grsai', model: 'gpt-image-2.5-flare', label: 'GPT Image 2.5 Flare' },
  { platform: 'grsai', model: 'gpt-image-2.5-sunburst', label: 'GPT Image 2.5 Sunburst' },
  { platform: 'grsai', model: 'gpt-image-2.6', label: 'GPT Image 2.6' },
  { platform: 'grsai', model: 'gpt-image-2.6-flare', label: 'GPT Image 2.6 Flare' },
  { platform: 'grsai', model: 'gpt-image-2.6-sunburst', label: 'GPT Image 2.6 Sunburst' },
  { platform: 'ai666', model: 'gpt-image-2', label: 'GPT Image 2' },
  // 小扳手（5208.ai）同步出图 /v1/images/generations、/v1/images/edits
  { platform: 'xibapi', model: 'gpt-image-2', label: 'GPT Image 2' },
  { platform: 'xibapi', model: 'gpt-image-2-2K', label: 'GPT Image 2 · 2K' },
  { platform: 'xibapi', model: 'gpt-image-2-4K', label: 'GPT Image 2 · 4K' },
  { platform: 'xibapi', model: 'gpt-image-2.5', label: 'GPT Image 2.5' },
  { platform: 'xibapi', model: 'gpt-image-2.5-flare', label: 'GPT Image 2.5 Flare' },
  { platform: 'xibapi', model: 'gpt-image-2.5-sunburst', label: 'GPT Image 2.5 Sunburst' },
  { platform: 'xibapi', model: 'gpt-image-2.6', label: 'GPT Image 2.6' },
  { platform: 'xibapi', model: 'gpt-image-2.6-2K', label: 'GPT Image 2.6 · 2K' },
  { platform: 'xibapi', model: 'gpt-image-2.6-4K', label: 'GPT Image 2.6 · 4K' },
  // 高瑞 OpenAI 原生同步出图（带 -sync 后缀）
  { platform: 'gaorui', model: 'gpt-image-2-sync', label: 'GPT Image 2' },
  { platform: 'gaorui', model: 'gpt-image-2.5-flare-sync', label: 'GPT Image 2.5 Flare' },
  { platform: 'gaorui', model: 'gpt-image-2.5-sunburst-sync', label: 'GPT Image 2.5 Sunburst' },
  { platform: 'gaorui', model: 'gpt-image-2.6-flare-sync', label: 'GPT Image 2.6 Flare' },
  { platform: 'gaorui', model: 'gpt-image-2.6-sunburst-sync', label: 'GPT Image 2.6 Sunburst' },
]

/**
 * 图生视频「贴真实商品」擦除和融合用的出图模型（只走 GRS.AI 的 /v1/api/generate）。
 * 2026-11-27 实测：同一张参考图 + 商品图，Nano Banana 商品画得完整、款式对；GPT Image 2.6 会丢结构。
 */
export const REPLACE_IMAGE_MODEL_OPTIONS: ModelOption[] = [
  { platform: 'grsai', model: 'nano-banana-2.1', label: 'Nano Banana 2.1（推荐）' },
  { platform: 'grsai', model: 'nano-banana-pro', label: 'Nano Banana Pro（更慢、更贵）' },
  { platform: 'grsai', model: 'nano-banana-2', label: 'Nano Banana 2' },
  { platform: 'grsai', model: 'gpt-image-2.6', label: 'GPT Image 2.6' },
]

export const CHAT_MODEL_OPTIONS: ModelOption[] = [
  { platform: 'grsai', model: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
  { platform: 'grsai', model: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { platform: 'grsai', model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { platform: 'ai666', model: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
  { platform: 'ai666', model: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
  // 高瑞对话兼容 OpenAI / Anthropic / Gemini 协议，文档没列固定型号，常用的放这里，其余走自定义
  { platform: 'gaorui', model: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
]
