/**
 * 多语言一键本地化：一条成片出越南语 / 泰语 / 印尼语 / 马来语 / 英语版。
 * 这里放主进程和界面共用的纯函数：语言表、配音对齐时间、字幕文件、AI 返回解析。
 */

export type LocalizeLanguage = 'vi' | 'th' | 'id' | 'ms' | 'en'
export type LocalizeVoice = 'female' | 'male'

export const LOCALIZE_LANGUAGES: Record<LocalizeLanguage, {
  label: string
  /** 给 AI 看的语言 / 市场名 */
  name: string
  market: string
  voices: Record<LocalizeVoice, string>
  /** 字幕字体（软件自带） */
  font: string
}> = {
  vi: { label: '越南语', name: 'Vietnamese', market: 'Vietnam', voices: { female: 'vi-VN-HoaiMyNeural', male: 'vi-VN-NamMinhNeural' }, font: 'Noto Sans' },
  th: { label: '泰语', name: 'Thai', market: 'Thailand', voices: { female: 'th-TH-PremwadeeNeural', male: 'th-TH-NiwatNeural' }, font: 'Noto Sans Thai' },
  id: { label: '印尼语', name: 'Indonesian', market: 'Indonesia', voices: { female: 'id-ID-GadisNeural', male: 'id-ID-ArdiNeural' }, font: 'Noto Sans' },
  ms: { label: '马来语', name: 'Malay', market: 'Malaysia', voices: { female: 'ms-MY-YasminNeural', male: 'ms-MY-OsmanNeural' }, font: 'Noto Sans' },
  en: { label: '英语', name: 'English', market: 'United States / Philippines', voices: { female: 'en-US-JennyNeural', male: 'en-US-GuyNeural' }, font: 'Noto Sans' },
}
export const LOCALIZE_LANGUAGE_CODES = Object.keys(LOCALIZE_LANGUAGES) as LocalizeLanguage[]

export function isLocalizeLanguage(value: unknown): value is LocalizeLanguage {
  return typeof value === 'string' && value in LOCALIZE_LANGUAGES
}

export type SourceCue = { startMs: number; endMs: number; text: string }
export type FittedCue = { startMs: number; endMs: number; tempo: number; text: string }

/** 配音最多加快到 1.4 倍，再快就听不清了 */
export const MAX_TEMPO = 1.4
const GAP_MS = 60

/**
 * 把每句配音放回原句的位置：从原句开头说，原句到下一句之间放不下就加快（≤1.4 倍），
 * 还放不下就把后面的句子顺延，保证不重叠。
 */
export function fitCues(input: { cues: SourceCue[]; texts: string[]; durationsMs: number[]; videoDurationMs: number }): FittedCue[] {
  const out: FittedCue[] = []
  let prevEnd = 0
  input.cues.forEach((cue, index) => {
    const duration = Math.max(1, input.durationsMs[index] || 0)
    const start = Math.max(cue.startMs, index === 0 ? 0 : prevEnd + GAP_MS)
    const nextStart = input.cues[index + 1]?.startMs ?? input.videoDurationMs
    const slot = Math.max(1, nextStart - start - GAP_MS)
    const tempo = Math.min(MAX_TEMPO, Math.max(1, duration / slot))
    const end = start + Math.round(duration / tempo)
    out.push({ startMs: start, endMs: end, tempo: Math.round(tempo * 100) / 100, text: input.texts[index] || '' })
    prevEnd = end
  })
  return out
}

export const LOCALIZE_SYSTEM = [
  'You localize TikTok Shop selling videos for a new market.',
  'Rewrite each voiceover line in natural, native {language} the way a local seller on TikTok in {market} would say it.',
  'Do not translate word by word. Keep the selling point of every line, keep brand names and numbers.',
  'Each line must be speakable in about the same time as the original line (similar length), so keep it short.',
  'Also localize the video title and description; replace hashtags with popular local ones, keep brand/product hashtags.',
  'Return exactly as many lines as given, in the same order.',
  'Reply with JSON only: {"lines":["..."],"title":"...","description":"..."}',
].join('\n')

export function localizeSystemPrompt(language: LocalizeLanguage) {
  const info = LOCALIZE_LANGUAGES[language]
  return LOCALIZE_SYSTEM.replace('{language}', info.name).replace('{market}', info.market)
}

export function parseLocalized(content: string, lineCount: number): { lines: string[]; title?: string; description?: string } | null {
  const text = String(content || '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    const lines = Array.isArray(parsed?.lines) ? parsed.lines.map((line: unknown) => String(line ?? '').trim()) : []
    if (lines.length !== lineCount || (lineCount > 0 && lines.some((line: string) => !line))) return null
    return {
      lines,
      title: String(parsed?.title || '').trim().slice(0, 150) || undefined,
      description: String(parsed?.description || '').trim().slice(0, 500) || undefined,
    }
  } catch {
    return null
  }
}

function assTime(ms: number) {
  // 用整数毫秒算，避免 1.2 秒变成 1.19 秒
  const total = Math.max(0, Math.round(ms))
  const s = Math.floor(total / 1000)
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const cs = Math.floor((total % 1000) / 10)
  return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}
function escAss(text: string) {
  return String(text ?? '').replace(/\r?\n/g, ' ').replace(/\{/g, '(').replace(/\}/g, ')')
}

/** 新字幕：底部居中、白字黑边，放在被模糊掉的原字幕区域里。 */
export function buildLocalizedAss(input: { cues: FittedCue[]; width: number; height: number; font: string }) {
  const fontSize = Math.round(input.height * 0.042)
  const marginV = Math.round(input.height * 0.15)
  const margin = Math.round(input.width * 0.07)
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${input.width}`,
    `PlayResY: ${input.height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Main,${input.font},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(fontSize / 12))},1,2,${margin},${margin},${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...input.cues.filter((cue) => cue.text).map((cue) => `Dialogue: 0,${assTime(cue.startMs)},${assTime(cue.endMs)},Main,,0,0,0,,${escAss(cue.text)}`),
    '',
  ].join('\n')
}

/** 原字幕常见区域（画面高度 68%–88%），打开「遮挡原字幕」时把这一条模糊掉 */
export const OLD_SUBTITLE_BAND = { top: 0.68, height: 0.2 }
