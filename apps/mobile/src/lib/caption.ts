/**
 * 批量字幕的标题图（和电脑端「overlay_image」一样）：按样式把标题画在透明画布上，宽 1080、高按视频比例。
 * 预览和成片用同一张图；云端把它铺满画面叠到视频上。
 */

export type CaptionStyle = {
  fontName: string
  fontSize: number
  fontColor: string
  strokeColor: string
  strokeWidth: number
  shadowColor: string
  shadowBlur: number
  position: 'top' | 'center' | 'bottom'
  /** 顶部位置时离顶部的距离（画面高度的百分比） */
  safeMargin: number
  textAlign: 'left' | 'center' | 'right'
  maxLines: number
  /** 文字最宽占画面宽度的比例 */
  maxWidthRatio: number
  lineGap: number
  /** 底部位置时离底部的像素（按 1080 宽） */
  bottomMargin: number
}

export function defaultCaptionStyle(): CaptionStyle {
  return { fontName: 'Noto Sans SC', fontSize: 64, fontColor: '#FFFFFF', strokeColor: '#000000', strokeWidth: 6, shadowColor: '#000000', shadowBlur: 12, position: 'bottom', safeMargin: 12, textAlign: 'center', maxLines: 2, maxWidthRatio: 0.7, lineGap: 8, bottomMargin: 220 }
}

/** 和电脑端同样的 5 套模板 */
export const CAPTION_PRESETS: Array<{ id: string; name: string; summary: string; style: Partial<CaptionStyle> }> = [
  { id: 'viral-hook', name: '爆款钩子款', summary: '适合前 3 秒抓停留，强对比、强情绪、强记忆点标题。', style: { fontName: 'SimHei', fontSize: 68, fontColor: '#FFFFFF', strokeColor: '#101116', strokeWidth: 8, shadowColor: 'rgba(0, 0, 0, 0.34)', shadowBlur: 10, position: 'bottom', textAlign: 'center', safeMargin: 10, maxLines: 2, maxWidthRatio: 0.8, lineGap: 6, bottomMargin: 188 } },
  { id: 'deal-punch', name: '促单成交款', summary: '适合价格利益点、限时优惠、爆点卖点，电商转化感更强。', style: { fontName: 'Microsoft YaHei', fontSize: 64, fontColor: '#FFF7D6', strokeColor: '#17181F', strokeWidth: 6, shadowColor: 'rgba(4, 6, 12, 0.42)', shadowBlur: 12, position: 'bottom', textAlign: 'center', safeMargin: 11, maxLines: 2, maxWidthRatio: 0.76, lineGap: 6, bottomMargin: 194 } },
  { id: 'premium-drop', name: '高客单精致款', summary: '适合饰品、美妆、质感单品，视觉更高级，更像高客单种草标题。', style: { fontName: 'Noto Sans SC', fontSize: 58, fontColor: '#F8FAFF', strokeColor: '#12131A', strokeWidth: 2, shadowColor: 'rgba(5, 8, 16, 0.56)', shadowBlur: 16, position: 'bottom', textAlign: 'center', safeMargin: 14, maxLines: 2, maxWidthRatio: 0.68, lineGap: 8, bottomMargin: 212 } },
  { id: 'vn-viral-bold', name: 'VN Viral Bold', summary: '越南 TikTok 爆款标题，粗体大字、强描边、强停留感。', style: { fontName: 'Arial Black', fontSize: 78, fontColor: '#FFF44F', strokeColor: '#050505', strokeWidth: 10, shadowColor: 'rgba(0, 0, 0, 0.45)', shadowBlur: 14, position: 'top', textAlign: 'center', safeMargin: 8, maxLines: 2, maxWidthRatio: 0.84, lineGap: 4, bottomMargin: 180 } },
  { id: 'vn-viral-outline', name: 'VN Viral Outline', summary: '越南电商短视频封面式标题，高对比红白字，符号感更强。', style: { fontName: 'Arial Black', fontSize: 74, fontColor: '#FFFFFF', strokeColor: '#D61F3A', strokeWidth: 8, shadowColor: 'rgba(8, 8, 8, 0.48)', shadowBlur: 16, position: 'top', textAlign: 'center', safeMargin: 8, maxLines: 2, maxWidthRatio: 0.82, lineGap: 4, bottomMargin: 176 } },
]

const CANVAS_WIDTH = 1080
const FALLBACK_FONTS = `'Microsoft YaHei','PingFang SC','Noto Sans CJK SC','Source Han Sans SC',Arial,sans-serif`

/** 按最大宽度折行（中文按字、英文按词），超过最大行数时末行加省略号 */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const lines: string[] = []
  for (const paragraph of text.split(/\n+/)) {
    const tokens = paragraph.match(/[⺀-￿]|[^\s⺀-￿]+|\s+/g) ?? []
    let line = ''
    for (const token of tokens) {
      const next = line + token
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line.trimEnd())
        line = token.trimStart()
      } else line = next
    }
    if (line.trim()) lines.push(line.trim())
  }
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]!
  while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1)
  kept[maxLines - 1] = `${last}…`
  return kept
}

/** 画一张标题图；aspect = 视频 宽/高（默认 9:16） */
export function drawCaption(text: string, style: CaptionStyle, aspect = 9 / 16): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = Math.round(CANVAS_WIDTH / Math.max(0.3, Math.min(3, aspect || 9 / 16)))
  const ctx = canvas.getContext('2d')!
  const content = text.trim()
  if (!content) return canvas
  ctx.font = `800 ${style.fontSize}px '${style.fontName}',${FALLBACK_FONTS}`
  ctx.textBaseline = 'top'
  const boxWidth = CANVAS_WIDTH * Math.max(0.3, Math.min(0.95, style.maxWidthRatio))
  const lines = wrap(ctx, content, boxWidth, Math.max(1, Math.min(6, Math.round(style.maxLines))))
  const lineHeight = style.fontSize * 1.18 + style.lineGap
  const blockHeight = lines.length * lineHeight - style.lineGap
  const top =
    style.position === 'top'
      ? (canvas.height * style.safeMargin) / 100
      : style.position === 'center'
        ? (canvas.height - blockHeight) / 2
        : canvas.height - style.bottomMargin - blockHeight
  const boxLeft = (CANVAS_WIDTH - boxWidth) / 2
  ctx.textAlign = style.textAlign
  const x = style.textAlign === 'left' ? boxLeft : style.textAlign === 'right' ? boxLeft + boxWidth : CANVAS_WIDTH / 2
  ctx.lineJoin = 'round'
  lines.forEach((line, index) => {
    const y = top + index * lineHeight
    // 阴影只给描边层，文字本身保持清晰
    ctx.save()
    ctx.shadowColor = style.shadowColor
    ctx.shadowBlur = style.shadowBlur
    if (style.strokeWidth > 0) {
      ctx.strokeStyle = style.strokeColor
      ctx.lineWidth = style.strokeWidth * 2
      ctx.strokeText(line, x, y)
    } else {
      ctx.fillStyle = style.fontColor
      ctx.fillText(line, x, y)
    }
    ctx.restore()
    ctx.fillStyle = style.fontColor
    ctx.fillText(line, x, y)
  })
  return canvas
}

export function captionBlob(text: string, style: CaptionStyle, aspect?: number): Promise<Blob> {
  const canvas = drawCaption(text, style, aspect)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('标题图生成失败'))), 'image/png'))
}
