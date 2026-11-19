/**
 * 批量字幕标题的排版（分行、字号、位置），画在 1080×1920 的画布上。
 * 渲染成片（电脑端 / 服务器，batchSubtitleBitmap.ts）和页面上的实时预览（浏览器）共用这一份，保证预览和成片一致。
 * 只算排版，不画图；量文字宽度由调用方提供（成片用字体文件量，浏览器用 canvas 量）。
 */

export const TITLE_CANVAS_WIDTH = 1080
export const TITLE_CANVAS_HEIGHT = 1920
/** 文字左右对齐时离画布边缘的距离（和成片一致） */
export const TITLE_EDGE_X = 72
/** 最大行数放不下时，字号最多缩到原来的这个比例 */
const MIN_SHRINK = 0.6

export type TitleLayoutStyle = {
  fontSize: number
  safeMargin: number
  bottomMargin?: number
  lineGap?: number
  maxWidthRatio?: number
  maxLines?: number
  position: 'top' | 'center' | 'bottom'
  textAlign: 'left' | 'center' | 'right'
  lineMode?: 'single' | 'multi'
  /** 自定义位置：文字块中心在画面高度的哪里（0 = 顶，1 = 底）；有值时代替顶部 / 居中 / 底部 */
  offsetYRatio?: number | null
  /** 整体再往下（正）/ 往上（负）挪多少像素：批量时每条视频位置微调用 */
  shiftYPx?: number
  /** 字重 400 / 600 / 700 / 900 */
  fontWeight?: number
  /** 自定义水平位置：文字块中心在画面宽度的哪里（0~1）；有值时文字块整体放在这里，对齐方式只管块内各行 */
  offsetXRatio?: number | null
  /** 第二行起（手动换行后）的字号比例：1 = 和第一行一样大，默认 0.68（小字副标题） */
  secondaryScale?: number
}

/** 加粗用的同色描边宽度（素材字体只有常规体）：常规 0，粗体约字号的 5%~9% */
export function titleBoldPx(fontWeight: number | undefined, fontSize: number) {
  const weight = Number(fontWeight) || 900
  const ratio = weight >= 900 ? 0.09 : weight >= 700 ? 0.06 : weight >= 600 ? 0.035 : 0
  return Math.round(Math.max(0, Number(fontSize) || 0) * ratio * 10) / 10
}

/** 量一段文字画出来有多宽（像素，按 1080 宽的画布） */
export type MeasureTitleText = (text: string, fontSize: number) => number

export type TitleLayoutLine = {
  text: string
  /** 第 2 行起的手动换行是副标题，字小一些 */
  secondary: boolean
  fontSize: number
  lineHeight: number
  width: number
  /** 这一行左边的 x（已按对齐方式算好） */
  x: number
  /** 文字基线的 y */
  baselineY: number
}

export type TitleLayout = {
  lines: TitleLayoutLine[]
  /** 为了放进最大行数，字号缩小到的比例（1 = 没缩） */
  scale: number
}

const CJK_OR_EMOJI = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}\\p{Extended_Pictographic}\\u3000-\\u303f\\uff00-\\uffef'
const TOKEN_RE = new RegExp(`[${CJK_OR_EMOJI}]|[^\\s${CJK_OR_EMOJI}]+|\\s+`, 'gu')

/** 手动换行拆成几段：第一段是主标题，后面是副标题（最多 4 段） */
export function splitTitleParagraphs(title: string, lineMode: TitleLayoutStyle['lineMode'] = 'multi') {
  const lines = String(title || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lineMode === 'single') return lines.slice(0, 1).map((text) => ({ text, secondary: false }))
  return lines.slice(0, 4).map((text, index) => ({ text, secondary: index > 0 }))
}

/** 按宽度自动换行：中日韩文字和表情可以在任意字间断开，英文按空格断，超长单词按字母断 */
export function wrapTitleText(text: string, fontSize: number, maxWidth: number, measure: MeasureTitleText): string[] {
  const tokens = String(text || '').match(TOKEN_RE) ?? []
  const lines: string[] = []
  let current = ''
  const push = () => {
    if (current.trim()) lines.push(current.trim())
    current = ''
  }
  for (const token of tokens) {
    const candidate = current + token
    if (!current || measure(candidate.trim(), fontSize) <= maxWidth) {
      current = candidate
      continue
    }
    if (/^\s+$/.test(token)) {
      push()
      continue
    }
    push()
    if (measure(token, fontSize) <= maxWidth) {
      current = token
      continue
    }
    for (const char of Array.from(token)) {
      if (current && measure(current + char, fontSize) > maxWidth) push()
      current += char
    }
  }
  push()
  return lines.length ? lines : [String(text || '').trim()].filter(Boolean)
}

/** 字号、留白等按成片的规则换算成像素 */
export function titleMetrics(style: TitleLayoutStyle) {
  const mainSize = Math.max(18, Math.min(160, Math.round(Number(style.fontSize) || 64)))
  const safeMarginPx = Math.max(48, Math.min(360, 180 + Math.round((Number(style.safeMargin) || 0) * 12)))
  const bottomMarginPx = Math.max(48, Math.min(900, Math.round(Number(style.bottomMargin) || 220)))
  const lineGapPx = Math.max(0, Math.min(40, Math.round(Number(style.lineGap) || 8)))
  const sidePadding = Math.max(32, (Number(style.safeMargin) || 0) * 8)
  const wrapWidth = (TITLE_CANVAS_WIDTH - sidePadding * 2) * Math.max(0.4, Math.min(0.92, Number(style.maxWidthRatio) || 0.72))
  return { mainSize, safeMarginPx, bottomMarginPx, lineGapPx, wrapWidth }
}

function wrapAll(title: string, style: TitleLayoutStyle, mainSize: number, wrapWidth: number, measure: MeasureTitleText) {
  const secondaryScale = Math.max(0.4, Math.min(1, Number(style.secondaryScale) || 0.68))
  const secondarySize = Math.max(16, Math.round(mainSize * secondaryScale))
  return splitTitleParagraphs(title, style.lineMode).flatMap((paragraph) => {
    const fontSize = paragraph.secondary ? secondarySize : mainSize
    return wrapTitleText(paragraph.text, fontSize, wrapWidth, measure).map((text) => ({ text, secondary: paragraph.secondary, fontSize }))
  })
}

/**
 * 排好一条标题：自动换行；超过「最大行数」时逐步缩小字号（最多缩到 60%）直到放得下；
 * 再按位置（顶部 / 居中 / 底部）和对齐方式算出每行的坐标。
 */
export function layoutTitle(title: string, style: TitleLayoutStyle, measure: MeasureTitleText): TitleLayout {
  const { mainSize, safeMarginPx, bottomMarginPx, lineGapPx, wrapWidth } = titleMetrics(style)
  const maxLines = Number(style.maxLines) > 0 ? Math.min(8, Math.round(Number(style.maxLines))) : 0
  let scale = 1
  let wrapped = wrapAll(title, style, mainSize, wrapWidth, measure)
  if (maxLines) {
    while (wrapped.length > maxLines && scale > MIN_SHRINK) {
      scale = Math.max(MIN_SHRINK, Math.round((scale - 0.05) * 100) / 100)
      wrapped = wrapAll(title, style, Math.round(mainSize * scale), wrapWidth, measure)
    }
  }
  const sized = wrapped.map((line) => ({
    ...line,
    lineHeight: Math.round(line.fontSize * (line.secondary && line.fontSize < mainSize ? 1.12 : 1.08)),
    width: measure(line.text, line.fontSize),
  }))
  const totalHeight = sized.reduce((sum, line) => sum + line.lineHeight, 0) + lineGapPx * Math.max(0, sized.length - 1)
  const customY = Number(style.offsetYRatio)
  const baseY =
    style.offsetYRatio !== undefined && style.offsetYRatio !== null && Number.isFinite(customY)
      ? Math.round(Math.max(0, Math.min(1, customY)) * TITLE_CANVAS_HEIGHT - totalHeight / 2)
      : style.position === 'center'
        ? Math.round((TITLE_CANVAS_HEIGHT - totalHeight) / 2)
        : style.position === 'bottom'
          ? TITLE_CANVAS_HEIGHT - bottomMarginPx - totalHeight
          : safeMarginPx
  // 不出画面：上下至少留 40 像素
  const startY = Math.round(Math.max(40, Math.min(TITLE_CANVAS_HEIGHT - totalHeight - 40, baseY + (Number(style.shiftYPx) || 0))))
  const customX = Number(style.offsetXRatio)
  const hasCustomX = style.offsetXRatio !== undefined && style.offsetXRatio !== null && Number.isFinite(customX)
  // 自定义水平位置：整块按最宽一行摆在指定位置（不出画面），块内按对齐方式排；否则按画面左 / 中 / 右对齐
  const blockWidth = Math.max(0, ...sized.map((line) => line.width))
  const blockLeft = hasCustomX ? Math.max(TITLE_EDGE_X / 2, Math.min(TITLE_CANVAS_WIDTH - TITLE_EDGE_X / 2 - blockWidth, customX * TITLE_CANVAS_WIDTH - blockWidth / 2)) : 0
  const anchorX = hasCustomX
    ? style.textAlign === 'left'
      ? blockLeft
      : style.textAlign === 'right'
        ? blockLeft + blockWidth
        : blockLeft + blockWidth / 2
    : style.textAlign === 'left'
      ? TITLE_EDGE_X
      : style.textAlign === 'right'
        ? TITLE_CANVAS_WIDTH - TITLE_EDGE_X
        : TITLE_CANVAS_WIDTH / 2
  let y = startY
  const lines = sized.map((line) => {
    const baselineY = y + line.lineHeight
    y += line.lineHeight + lineGapPx
    const x = style.textAlign === 'left' ? anchorX : style.textAlign === 'right' ? anchorX - line.width : anchorX - line.width / 2
    return { ...line, x, baselineY }
  })
  return { lines, scale }
}
