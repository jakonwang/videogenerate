import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  ASS_DEFAULT_FONT_SIZE,
  ASS_POP_TITLE_FONT_FAMILY,
  ASS_STYLE_MAIN_CONTENT,
  ASS_STYLE_SYMBOL_ROW,
  ASS_STYLE_TITLE_TEXT,
} from '../../../shared/assDefaults'
import {
  ASS_POP_IN_DIALOGUE_PREFIX,
  ASS_WHITE_SHADOW_DIALOGUE_PREFIX,
  assTime,
  escAssText,
} from './ass'

export type GenerateAssFileOptions = {
  fontName?: string
  marginV?: number
  fontSize?: number
  marginL?: number
  marginR?: number
  alignment?: number
  fontColor?: string
  outlineColor?: string
  outlineWidth?: number
  shadowColor?: string
  shadowWidth?: number
}

function hexToAssColor(input: string | undefined, fallback: string): string {
  const raw = String(input || '').trim()
  const normalized = raw.match(/^#?([0-9a-fA-F]{6})$/)?.[1]
  if (!normalized) return fallback
  const rr = normalized.slice(0, 2).toUpperCase()
  const gg = normalized.slice(2, 4).toUpperCase()
  const bb = normalized.slice(4, 6).toUpperCase()
  return `&H00${bb}${gg}${rr}`
}

function buildWhiteShadowStyleLine(
  styleName: string,
  font: string,
  fontSize: number,
  marginV: number,
  marginL: number,
  marginR: number,
  alignment: number,
  fontColor?: string,
  outlineColor?: string,
  outlineWidth?: number,
  shadowColor?: string,
  shadowWidth?: number,
): string {
  const primary = hexToAssColor(fontColor, '&H00FFFFFF')
  const secondary = primary
  const outlineC = hexToAssColor(outlineColor, '&H00332B2A')
  const back = hexToAssColor(shadowColor, '&H00000000')
  const outlineW = Math.max(0, Math.min(12, Number(outlineWidth ?? 3)))
  const shadowW = Math.max(0, Math.min(12, Number(shadowWidth ?? 0)))
  const safeMarginV = Math.max(0, Math.min(900, Math.round(marginV)))
  const safeMarginL = Math.max(0, Math.min(320, Math.round(marginL)))
  const safeMarginR = Math.max(0, Math.min(320, Math.round(marginR)))
  const safeAlignment = Math.max(1, Math.min(9, Math.round(alignment || 8)))
  return `Style: ${styleName},${font},${fontSize},${primary},${secondary},${outlineC},${back},1,1,0,0,100,100,0,0,1,${outlineW},${shadowW},${safeAlignment},${safeMarginL},${safeMarginR},${safeMarginV},1`
}

export function buildPremiumShortTitleAssContent(
  titleText: string,
  durationSec: number,
  opts?: GenerateAssFileOptions & { symbolRowText?: string },
): string {
  const font = opts?.fontName ?? ASS_POP_TITLE_FONT_FAMILY
  const marginV = Math.max(0, Math.min(600, Math.round(opts?.marginV ?? 250)))
  const marginL = Math.max(0, Math.min(320, Math.round(opts?.marginL ?? 20)))
  const marginR = Math.max(0, Math.min(320, Math.round(opts?.marginR ?? 20)))
  const alignment = Math.max(1, Math.min(9, Math.round(opts?.alignment ?? 8)))
  const fontSize = Math.max(18, Math.min(120, Math.round(opts?.fontSize ?? ASS_DEFAULT_FONT_SIZE)))
  const symbolSize = Math.max(16, Math.min(96, Math.round(fontSize * 0.68)))
  const td = Math.max(0.2, Number(durationSec ?? 0))
  const symbolRaw = (opts?.symbolRowText ?? '').trim()

  if (!symbolRaw) {
    const styleLine = buildWhiteShadowStyleLine(
      ASS_STYLE_MAIN_CONTENT,
      font,
      fontSize,
      marginV,
      marginL,
      marginR,
      alignment,
      opts?.fontColor,
      opts?.outlineColor,
      opts?.outlineWidth,
      opts?.shadowColor,
      opts?.shadowWidth,
    )
    const lines = [
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
      styleLine,
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      `Dialogue: 0,${assTime(0)},${assTime(td)},${ASS_STYLE_MAIN_CONTENT},,0,0,0,,${ASS_WHITE_SHADOW_DIALOGUE_PREFIX}${escAssText(titleText)}`,
      '',
    ]
    return lines.join('\n')
  }

  const styleTitle = buildWhiteShadowStyleLine(
    ASS_STYLE_TITLE_TEXT,
    font,
    fontSize,
    marginV,
    marginL,
    marginR,
    alignment,
    opts?.fontColor,
    opts?.outlineColor,
    opts?.outlineWidth,
    opts?.shadowColor,
    opts?.shadowWidth,
  )
  const styleSymbol = buildWhiteShadowStyleLine(
    ASS_STYLE_SYMBOL_ROW,
    font,
    symbolSize,
    marginV,
    marginL,
    marginR,
    alignment,
    opts?.fontColor,
    opts?.outlineColor,
    opts?.outlineWidth,
    opts?.shadowColor,
    opts?.shadowWidth,
  )
  const dialogueText =
    `${ASS_POP_IN_DIALOGUE_PREFIX}{\\r${ASS_STYLE_TITLE_TEXT}}${escAssText(titleText)}{\\r${ASS_STYLE_SYMBOL_ROW}}\\N${escAssText(symbolRaw)}`

  const lines = [
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
    styleTitle,
    styleSymbol,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    `Dialogue: 0,${assTime(0)},${assTime(td)},${ASS_STYLE_TITLE_TEXT},,0,0,0,,${dialogueText}`,
    '',
  ]
  return lines.join('\n')
}

export async function generateAssFile(
  titleText: string,
  symbolRowText: string,
  durationSec: number,
  outputPath: string,
  options?: GenerateAssFileOptions,
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true })
  const body = buildPremiumShortTitleAssContent(titleText, durationSec, {
    ...options,
    symbolRowText,
  })
  await writeFile(outputPath, body, { encoding: 'utf8' })
}

export { pickRandomSymbolRow, SYMBOL_ROW_POOL } from '../../../shared/symbolRowPool'
