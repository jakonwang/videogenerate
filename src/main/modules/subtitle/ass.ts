import { readFile } from 'node:fs/promises'
import {
  ASS_DEFAULT_FONT_FAMILY,
  ASS_DEFAULT_FONT_SIZE,
  ASS_DEFAULT_TITLE_MARGIN_V,
  ASS_DEFAULT_TTS_MARGIN_V,
  ASS_FONT_NAMES_MAP_TO_POP_ROUND,
  ASS_POP_TITLE_FONT_FAMILY,
  ASS_STYLE_MAIN_CONTENT,
  ASS_STYLE_MAIN_CONTENT_BOTTOM,
  ASS_STYLE_SYMBOL_ROW,
  ASS_STYLE_TITLE_TEXT,
} from '../../../shared/assDefaults'

export type TtsSubtitlePart = { part: string; start: number; end: number } // ms

export type AssStylePreset = 'yellow_box' | 'white_shadow'
export type AssTitlePlacement = 'top' | 'middle' | 'bottom'
export type AssTtsPlacement = 'bottom' | 'top'

/** staticTitle：整段视频置顶标题；timedSpeech：随配音时间轴的字幕（可与标题同时存在） */
export type AssRenderOptions = {
  fontName: string
  fontSize: number
  preset: AssStylePreset
  /** 顶部标题距顶边(px)（Alignment=8）；越大越远离顶边、越偏「上中有余」 */
  marginV: number
  /** 配音字幕距底边(px)（Alignment=2）；越大越远离底边、越偏「下中有余」 */
  ttsMarginV: number
  /** 标题自动选位：top / middle / bottom */
  titlePlacement?: AssTitlePlacement
  /** 配音字幕位置：默认 bottom；当标题在 bottom 时可切到 top */
  ttsPlacement?: AssTtsPlacement
  staticTitle?: { text: string; durationSec: number } | null
  timedSpeech?: {
    text: string
    audioDurationSec: number
    parts?: TtsSubtitlePart[] | null
  } | null
}

export function assTime(sec: number) {
  const s = Math.max(0, sec)
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = Math.floor(s % 60)
  const cs = Math.floor((s - Math.floor(s)) * 100)
  return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

export function escAssText(s: string) {
  return String(s ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\{/g, '｛')
    .replace(/\}/g, '｝')
    .replace(/\n/g, '\\N')
}

/** TikTok 风 Pop-in：150ms 淡入/淡出 + 初始 120%，0–200ms 缩回 100%；须写在 escAssText 之前 */
export const ASS_POP_IN_DIALOGUE_PREFIX = String.raw`{\fad(150,150)\fscx120\fscy120\t(0,200,\fscx100\fscy100)}`

/**
 * white_shadow 专用：在 Pop-in 内显式指定粗斜体，与 [V4+ Styles] 中 MainContent 的 Bold=1 Italic=1 一致。
 *
 * 注意：不要在这里强行写死 `\fn<族名>`，否则会覆盖模板/用户选择的字体族名，导致导入的 TTF/OTF 不生效甚至无字形可用。
 */
export const ASS_WHITE_SHADOW_DIALOGUE_PREFIX =
  String.raw`{\fad(150,150)\b1\i1\fscx120\fscy120\t(0,200,\fscx100\fscy100)}`

/** 画面标题文案：首行标题，其余行合并为符号/装饰行（可含换行） */
export function parseStaticTitleOverlayBody(raw: string | undefined): { title: string; symbol: string } {
  const s = String(raw ?? '').replace(/\r\n/g, '\n')
  const i = s.indexOf('\n')
  if (i < 0) return { title: s.trim(), symbol: '' }
  return { title: s.slice(0, i).trim(), symbol: s.slice(i + 1).trim() }
}

function whiteShadowStyleLine(
  styleName: string,
  font: string,
  fontSize: number,
  marginV: number,
  alignment: number,
): string {
  const primary = '&H00FFFFFF'
  const secondary = '&H00FFFFFF'
  const outlineC = '&H00332B2A'
  const back = '&H00000000'
  const outlineW = 3
  const shadowW = 0
  const size = Math.max(12, Math.min(120, Math.round(fontSize)))
  const mv = Math.max(0, Math.min(600, Math.round(marginV)))
  return `Style: ${styleName},${font},${size},${primary},${secondary},${outlineC},${back},1,1,0,0,100,100,0,0,1,${outlineW},${shadowW},${alignment},20,20,${mv},1`
}

function resolveWhiteShadowDisplayFont(requested: string): string {
  const raw = (requested ?? '').trim() || ASS_DEFAULT_FONT_FAMILY
  return ASS_FONT_NAMES_MAP_TO_POP_ROUND.has(raw) ? ASS_POP_TITLE_FONT_FAMILY : raw
}

function normalizeTitlePlacement(input: AssRenderOptions): AssTitlePlacement {
  const p = String(input.titlePlacement ?? 'top')
  if (p === 'middle' || p === 'bottom') return p
  return 'top'
}

function normalizeTtsPlacement(input: AssRenderOptions): AssTtsPlacement {
  const p = String(input.ttsPlacement ?? 'bottom')
  if (p === 'top') return 'top'
  return 'bottom'
}

function titleAlignmentByPlacement(p: AssTitlePlacement): number {
  if (p === 'middle') return 5
  if (p === 'bottom') return 2
  return 8
}

function ttsAlignmentByPlacement(p: AssTtsPlacement): number {
  return p === 'top' ? 8 : 2
}

function titleMarginByPlacement(input: AssRenderOptions, p: AssTitlePlacement): number {
  const m = Math.round(input.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V)
  if (p === 'middle') return 0
  return Math.max(0, Math.min(600, m))
}

function ttsMarginByPlacement(input: AssRenderOptions, p: AssTtsPlacement): number {
  const m = Math.round(input.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V)
  if (p === 'top') return Math.max(0, Math.min(600, m))
  return Math.max(40, Math.min(500, m))
}

function styleLineTitle(input: AssRenderOptions) {
  const size = Math.max(18, Math.min(120, Math.round(input.fontSize || ASS_DEFAULT_FONT_SIZE)))
  const titlePlacement = normalizeTitlePlacement(input)
  const alignment = titleAlignmentByPlacement(titlePlacement)
  const marginV = titleMarginByPlacement(input, titlePlacement)

  // V4+ Style：BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding —— 勿多插一位，否则 Alignment 会错位成 0/2（标题会跑到画面底部）
  if (input.preset === 'yellow_box') {
    const font = input.fontName || ASS_DEFAULT_FONT_FAMILY
    const primary = '&H00000000'
    const outline = '&H00000000'
    const back = '&H0000D7FF'
    return `Style: YellowCaptionTop,${font},${size},${primary},${primary},${primary},${back},0,0,0,0,100,100,0,0,3,10,2,${alignment},20,20,${marginV},1`
  }
  // 白字网感：MainContent，Bold=1 Italic=1，暖深灰描边 Outline=3（默认模板 Noto 族名映射为 Nunito + Bold Italic woff2）
  const font = resolveWhiteShadowDisplayFont(input.fontName || '')
  const primary = '&H00FFFFFF'
  const secondary = '&H00FFFFFF'
  const outlineC = '&H00332B2A'
  const back = '&H00000000'
  const outlineW = 3
  const shadowW = 0
  return `Style: ${ASS_STYLE_MAIN_CONTENT},${font},${size},${primary},${secondary},${outlineC},${back},1,1,0,0,100,100,0,0,1,${outlineW},${shadowW},${alignment},20,20,${marginV},1`
}

/** 与标题并存时，配音字幕用底部居中，避免与顶部标题重叠 */
function styleLineTimed(input: AssRenderOptions) {
  const size = Math.max(16, Math.min(96, Math.round((input.fontSize || ASS_DEFAULT_FONT_SIZE) * 0.88)))
  const ttsPlacement = normalizeTtsPlacement(input)
  const alignment = ttsAlignmentByPlacement(ttsPlacement)
  const marginV = ttsMarginByPlacement(input, ttsPlacement)

  if (input.preset === 'yellow_box') {
    const font = input.fontName || ASS_DEFAULT_FONT_FAMILY
    const primary = '&H00000000'
    const outline = '&H00000000'
    const back = '&H0000D7FF'
    return `Style: YellowCaptionBottom,${font},${size},${primary},${primary},${primary},${back},0,0,0,0,100,100,0,0,3,8,2,${alignment},20,20,${marginV},1`
  }
  const font = resolveWhiteShadowDisplayFont(input.fontName || '')
  const primary = '&H00FFFFFF'
  const secondary = '&H00FFFFFF'
  const outlineC = '&H00332B2A'
  const back = '&H00000000'
  return `Style: ${ASS_STYLE_MAIN_CONTENT_BOTTOM},${font},${size},${primary},${secondary},${outlineC},${back},1,1,0,0,100,100,0,0,1,3,0,${alignment},20,20,${marginV},1`
}

/** 生成 UTF-8 ASS（无 BOM），libass/FFmpeg 按 UTF-8 解析 */
export function buildAss(opts: AssRenderOptions) {
  const rawStatic = String(opts.staticTitle?.text ?? '').trim()
  let { title: staticTitleLine, symbol: staticSymbolBlock } = parseStaticTitleOverlayBody(
    opts.staticTitle?.text ?? '',
  )
  if (!staticTitleLine && staticSymbolBlock) {
    staticTitleLine = staticSymbolBlock
    staticSymbolBlock = ''
  }
  const hasStatic = Boolean(rawStatic)
  const ts = opts.timedSpeech
  const hasTimedRaw = Boolean(ts?.text?.trim()) || Boolean(ts?.parts?.length)
  const hasTimed = Boolean(ts && hasTimedRaw)
  const titlePlacement = normalizeTitlePlacement(opts)

  const useWhiteShadowTitleSymbol =
    opts.preset === 'white_shadow' && Boolean(staticSymbolBlock) && hasStatic

  const styles: string[] = []
  if (useWhiteShadowTitleSymbol) {
    const font = resolveWhiteShadowDisplayFont(opts.fontName || '')
    const size = Math.max(18, Math.min(120, Math.round(opts.fontSize || ASS_DEFAULT_FONT_SIZE)))
    const symbolSize = Math.max(16, Math.min(96, Math.round(size * 0.68)))
    const alignment = titleAlignmentByPlacement(titlePlacement)
    const marginV = titleMarginByPlacement(opts, titlePlacement)
    styles.push(whiteShadowStyleLine(ASS_STYLE_TITLE_TEXT, font, size, marginV, alignment))
    styles.push(whiteShadowStyleLine(ASS_STYLE_SYMBOL_ROW, font, symbolSize, marginV, alignment))
  } else {
    styles.push(styleLineTitle(opts))
  }
  // 配音同步字幕统一用底部居中样式（与顶部标题分离）
  if (hasTimed) styles.push(styleLineTimed(opts))

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'Collisions: Normal',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
    ...styles,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ]

  const events: string[] = []

  const styleTop =
    opts.preset === 'white_shadow' ? ASS_STYLE_MAIN_CONTENT : 'YellowCaptionTop'
  const styleBottom =
    opts.preset === 'white_shadow' ? ASS_STYLE_MAIN_CONTENT_BOTTOM : 'YellowCaptionBottom'

  if (hasStatic) {
    const st = opts.staticTitle!
    const td = Math.max(0.2, Number(st.durationSec ?? 0))
    if (useWhiteShadowTitleSymbol) {
      const dialogueText =
        `${ASS_POP_IN_DIALOGUE_PREFIX}{\\r${ASS_STYLE_TITLE_TEXT}}${escAssText(staticTitleLine)}{\\r${ASS_STYLE_SYMBOL_ROW}}\\N${escAssText(staticSymbolBlock)}`
      events.push(
        `Dialogue: 0,${assTime(0)},${assTime(td)},${ASS_STYLE_TITLE_TEXT},,0,0,0,,${dialogueText}`,
      )
    } else {
      const pop = opts.preset === 'white_shadow' ? ASS_WHITE_SHADOW_DIALOGUE_PREFIX : ''
      events.push(`Dialogue: 0,${assTime(0)},${assTime(td)},${styleTop},,0,0,0,,${pop}${escAssText(rawStatic)}`)
    }
  }

  if (hasTimed && ts) {
    const dur = Math.max(0.2, Number(ts.audioDurationSec ?? 0))
    const styleName = styleBottom
    const pop = opts.preset === 'white_shadow' ? ASS_WHITE_SHADOW_DIALOGUE_PREFIX : ''
    const parts = Array.isArray(ts.parts) ? ts.parts.filter((p) => p && Number.isFinite(p.start) && Number.isFinite(p.end)) : []

    if (parts.length >= 2) {
      for (const p of parts) {
        const s = Math.max(0, p.start / 1000)
        const e = Math.max(s + 0.06, p.end / 1000)
        events.push(
          `Dialogue: 0,${assTime(s)},${assTime(Math.min(e, dur))},${styleName},,0,0,0,,${pop}${escAssText(p.part)}`,
        )
      }
    } else {
      const txt = String(ts.text ?? '')
      events.push(`Dialogue: 0,${assTime(0)},${assTime(dur)},${styleName},,0,0,0,,${pop}${escAssText(txt)}`)
    }
  }

  return header.concat(events).join('\n') + '\n'
}

export async function readTtsPartsJson(jsonPath: string): Promise<TtsSubtitlePart[] | null> {
  try {
    const raw = await readFile(jsonPath, 'utf8')
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return null
    return arr
      .map((x: any) => ({ part: String(x?.part ?? ''), start: Number(x?.start ?? NaN), end: Number(x?.end ?? NaN) }))
      .filter((x) => x.part && Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start)
  } catch {
    return null
  }
}
