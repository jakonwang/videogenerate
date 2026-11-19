/**
 * 标题字幕的样式：默认值、模板、字体 / 表情列表、记住的设置。
 * 「视频批量字幕」页面和复刻 / 图生视频 / tk创意室里的「批量添加字幕」弹窗共用这一份，
 * 在一个地方改了模板或样式，其它地方打开也是同一套。
 */
import type { BatchSubtitleCaptionStyle } from '@/lib/webApiClient'

export type SubtitleCaptionStyle = BatchSubtitleCaptionStyle
export type SubtitleTitleStrategy = 'single_for_all' | 'random_pool'
export type SubtitlePresetId = 'tiktok-native' | 'viral-hook' | 'deal-punch' | 'premium-drop' | 'vn-viral-bold' | 'vn-viral-outline'
export type SubtitlePreset = { id: SubtitlePresetId; name: string; summary: string; style: Partial<SubtitleCaptionStyle> }

type Translate = (key: string, values?: Record<string, unknown>) => string

/** 默认就是「TikTok 原生」样式（照着投放效果好的带货视频做的） */
export function defaultSubtitleCaptionStyle(): SubtitleCaptionStyle {
  return {
    fontName: 'Noto Sans SC',
    fontSize: 52,
    fontWeight: 600,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 0,
    shadowColor: '#000000',
    shadowBlur: 10,
    position: 'center',
    offsetYRatio: 0.42,
    offsetXRatio: null,
    safeMargin: 12,
    textAlign: 'center',
    maxLines: 2,
    maxWidthRatio: 0.8,
    lineGap: 6,
    bottomMargin: 220,
    secondaryScale: 1,
    positionJitter: 0,
  }
}

export function subtitlePresets(tr: Translate): SubtitlePreset[] {
  return [
    {
      // 短句 + 表情，白色中粗小字、柔和阴影、不描边，像在 TikTok 里直接打的字，放在商品旁边
      id: 'tiktok-native',
      name: tr('bsx.presetNative'),
      summary: tr('bsx.presetNativeSummary'),
      style: {
        fontName: 'Noto Sans SC',
        fontSize: 52,
        fontWeight: 600,
        fontColor: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 0,
        shadowColor: '#000000',
        shadowBlur: 10,
        position: 'center',
        offsetYRatio: 0.42,
        offsetXRatio: null,
        textAlign: 'center',
        maxLines: 2,
        maxWidthRatio: 0.8,
        lineGap: 6,
        secondaryScale: 1,
      },
    },
    {
      id: 'viral-hook',
      name: tr('autoUi.k_469e324ba51b'),
      summary: tr('autoUi.k_cee620d9318e'),
      style: { fontName: 'SimHei', fontSize: 68, fontColor: '#FFFFFF', strokeColor: '#101116', strokeWidth: 8, shadowColor: 'rgba(0, 0, 0, 0.34)', shadowBlur: 10, position: 'bottom', textAlign: 'center', safeMargin: 10, maxLines: 2, maxWidthRatio: 0.8, lineGap: 6, bottomMargin: 188 },
    },
    {
      id: 'deal-punch',
      name: tr('autoUi.k_16d824cf7aac'),
      summary: tr('autoUi.k_5112ff1701be'),
      style: { fontName: 'Microsoft YaHei', fontSize: 64, fontColor: '#FFF7D6', strokeColor: '#17181F', strokeWidth: 6, shadowColor: 'rgba(4, 6, 12, 0.42)', shadowBlur: 12, position: 'bottom', textAlign: 'center', safeMargin: 11, maxLines: 2, maxWidthRatio: 0.76, lineGap: 6, bottomMargin: 194 },
    },
    {
      id: 'premium-drop',
      name: tr('autoUi.k_995c4ae82e7f'),
      summary: tr('autoUi.k_140953ff6916'),
      style: { fontName: 'Noto Sans SC', fontSize: 58, fontColor: '#F8FAFF', strokeColor: '#12131A', strokeWidth: 2, shadowColor: 'rgba(5, 8, 16, 0.56)', shadowBlur: 16, position: 'bottom', textAlign: 'center', safeMargin: 14, maxLines: 2, maxWidthRatio: 0.68, lineGap: 8, bottomMargin: 212 },
    },
    {
      id: 'vn-viral-bold',
      name: 'VN Viral Bold',
      summary: tr('autoUi.k_2ea22f84f8ed'),
      style: { fontName: 'Arial Black', fontSize: 78, fontColor: '#FFF44F', strokeColor: '#050505', strokeWidth: 10, shadowColor: 'rgba(0, 0, 0, 0.45)', shadowBlur: 14, position: 'top', textAlign: 'center', safeMargin: 8, maxLines: 2, maxWidthRatio: 0.84, lineGap: 4, bottomMargin: 180 },
    },
    {
      id: 'vn-viral-outline',
      name: 'VN Viral Outline',
      summary: tr('autoUi.k_146e6100be2f'),
      style: { fontName: 'Arial Black', fontSize: 74, fontColor: '#FFFFFF', strokeColor: '#D61F3A', strokeWidth: 8, shadowColor: 'rgba(8, 8, 8, 0.48)', shadowBlur: 16, position: 'top', textAlign: 'center', safeMargin: 8, maxLines: 2, maxWidthRatio: 0.82, lineGap: 4, bottomMargin: 176 },
    },
  ]
}

/** 套用模板：旧模板是大标题样式（粗体、固定在顶部 / 底部、第二行小字），新加的设置先恢复成那样 */
export function applySubtitlePreset(current: SubtitleCaptionStyle, preset: SubtitlePreset): SubtitleCaptionStyle {
  return {
    ...current,
    fontWeight: 900,
    offsetYRatio: null,
    offsetXRatio: null,
    secondaryScale: 0.68,
    ...preset.style,
  }
}

export const SUBTITLE_FONT_OPTIONS = ['Noto Sans SC', 'Microsoft YaHei', 'SimHei', 'KaiTi', 'Arial Black', 'Arial', 'Impact']
export const SUBTITLE_EMOJIS = ['✨', '🔥', '🤩', '😍', '🥰', '😚', '💖', '👇', '💯', '🎁']

/** 页面上量文字宽度用的字体（和预览画字用的同一组） */
export function subtitleFontStack(fontName?: string) {
  return `"${String(fontName || 'Noto Sans SC').replace(/"/g, '')}", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif`
}

let measureCtx: CanvasRenderingContext2D | null = null
/** 在页面里量一段文字的宽度（成片字体只有常规体，所以按常规体量） */
export function measureSubtitleText(fontName: string | undefined, text: string, size: number) {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * size
  measureCtx.font = `400 ${size}px ${subtitleFontStack(fontName)}`
  return measureCtx.measureText(text).width
}

/* ---------------- 记住上次的标题和样式（本机，各处共用） ---------------- */

export type SubtitleSettings = {
  captionStyle: SubtitleCaptionStyle
  titleStrategy: SubtitleTitleStrategy
  titleText: string
  titlePoolText: string
  preset: SubtitlePresetId
}

const SETTINGS_KEY = 'bsx.settings.v1'

export function loadSubtitleSettings(): SubtitleSettings {
  const fallback: SubtitleSettings = { captionStyle: defaultSubtitleCaptionStyle(), titleStrategy: 'single_for_all', titleText: '', titlePoolText: '', preset: 'tiktok-native' }
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
    if (!saved) return fallback
    return {
      captionStyle: { ...defaultSubtitleCaptionStyle(), ...(saved.captionStyle || {}) },
      titleStrategy: saved.titleStrategy === 'random_pool' ? 'random_pool' : 'single_for_all',
      titleText: typeof saved.titleText === 'string' ? saved.titleText : '',
      titlePoolText: typeof saved.titlePoolText === 'string' ? saved.titlePoolText : '',
      preset: saved.preset || fallback.preset,
    }
  } catch {
    return fallback
  }
}

export function saveSubtitleSettings(settings: SubtitleSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* 存不了就算了 */
  }
}

export function splitTitlePool(text: string) {
  return String(text || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}
