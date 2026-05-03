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
  /** 默认 Nunito（圆润 Bold Italic，fontsdir 需含 Nunito 700 正/斜 woff2） */
  fontName?: string
  /** 顶部安全区，默认 250（规范示例）；可与模板 marginV 对齐 */
  marginV?: number
  /** 默认与 ASS_DEFAULT_FONT_SIZE 一致（PlayResY=1920 推荐 70） */
  fontSize?: number
}

function buildWhiteShadowStyleLine(
  styleName: string,
  font: string,
  fontSize: number,
  marginV: number,
): string {
  const primary = '&H00FFFFFF'
  const secondary = '&H00FFFFFF'
  const outlineC = '&H00332B2A'
  const back = '&H00000000'
  const outlineW = 3
  const shadowW = 0
  return `Style: ${styleName},${font},${fontSize},${primary},${secondary},${outlineC},${back},1,1,0,0,100,100,0,0,1,${outlineW},${shadowW},8,20,20,${marginV},1`
}

/**
 * 生成单条 Dialogue 的极简 ASS（V4+），用于工具链/测试或与 FFmpeg subtitles 配合。
 *
 * - **仅标题**：单样式 `MainContent`，前缀 `ASS_WHITE_SHADOW_DIALOGUE_PREFIX`（粗斜体 Pop-in）。
 * - **标题 + 符号行**：双样式 `TitleText` / `SymbolRow`（均为 Bold+Italic、同色描边），正文为
 *   `{\fad…\fscx…}{\rTitleText}…{\rSymbolRow}\N…`；前缀仅用 `ASS_POP_IN_DIALOGUE_PREFIX`，避免样式冲突。
 */
export function buildPremiumShortTitleAssContent(
  titleText: string,
  durationSec: number,
  opts?: GenerateAssFileOptions & { symbolRowText?: string },
): string {
  const font = opts?.fontName ?? ASS_POP_TITLE_FONT_FAMILY
  const marginV = Math.max(0, Math.min(600, Math.round(opts?.marginV ?? 250)))
  const fontSize = Math.max(18, Math.min(120, Math.round(opts?.fontSize ?? ASS_DEFAULT_FONT_SIZE)))
  const symbolSize = Math.max(16, Math.min(96, Math.round(fontSize * 0.68)))
  const td = Math.max(0.2, Number(durationSec ?? 0))
  const symbolRaw = (opts?.symbolRowText ?? '').trim()

  if (!symbolRaw) {
    const styleLine = buildWhiteShadowStyleLine(ASS_STYLE_MAIN_CONTENT, font, fontSize, marginV)
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

  const styleTitle = buildWhiteShadowStyleLine(ASS_STYLE_TITLE_TEXT, font, fontSize, marginV)
  const styleSymbol = buildWhiteShadowStyleLine(ASS_STYLE_SYMBOL_ROW, font, symbolSize, marginV)
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

/**
 * 动态写入 UTF-8 .ass（无 BOM），供 FFmpeg `subtitles=` 使用。
 *
 * @param titleText 主标题（Bold+Italic）
 * @param symbolRowText 符号装饰行；传空串则仅输出单行标题（与旧行为一致）
 * @param options.fontName 可选，默认见 `GenerateAssFileOptions.fontName`
 */
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
