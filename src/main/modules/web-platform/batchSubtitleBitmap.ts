import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import * as fontkitModule from 'fontkit'
import { getAppPaths } from '../../lib/paths'
import { bundledEmojiDir, resolveSubtitleRenderFont } from '../../lib/fontResolve'
import { probeMedia } from '../ffmpeg/probe'
import { getMediaInfo } from '../media/info'
import { runFfmpeg } from '../ffmpeg/runner'
import type { BatchSubtitleSourceItem, BatchSubtitleStyleConfig, BatchSubtitleTitleConfig } from './types'
import { layoutTitle, titleBoldPx } from '../../../shared/subtitleTitleLayout'

const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1920
const NORMALIZE_VIDEO_FILTER =
  'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black'

type SubtitleSceneLine = {
  runs: SubtitleSceneRun[]
  role: 'primary' | 'secondary'
  fontSize: number
  lineHeight: number
  /** 这一行左边的 x（共用排版算好的） */
  x: number
}

type SubtitleSceneRun = {
  text: string
  kind: 'text' | 'emoji'
}

type SubtitleDrawRun = {
  kind: 'text' | 'emoji'
  text: string
  width: number
  height: number
}

type SubtitleSceneSpec = {
  canvasWidth: number
  canvasHeight: number
  videoFitMode: 'contain_pad'
  anchor: BatchSubtitleStyleConfig['position']
  alignment: BatchSubtitleStyleConfig['textAlign']
  safeMarginPx: number
  bottomMarginPx: number
  fontFamily: string
  fontColor: string
  strokeColor: string
  strokeWidth: number
  shadowColor: string
  shadowBlur: number
  lineGapPx: number
  lines: SubtitleSceneLine[]
  /** 第一行顶部的 y（来自共用排版，含自定义位置和每条视频的位置微调） */
  startY: number
  /** 字重：素材字体只有常规体，用同色描边加粗（0 = 不加粗） */
  boldPx: number
}

const DEFAULT_TEXT_FONT_FALLBACK =
  "'Noto Sans SC','Microsoft YaHei','PingFang SC','Source Han Sans SC','Noto Sans',sans-serif"
const DEFAULT_EMOJI_FONT_FALLBACK =
  "'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji','Segoe UI Symbol','Noto Sans Symbols 2',sans-serif"
const PROJECT_EMOJI_FONT_FAMILY = 'VGEmbeddedEmoji'
const PROJECT_TEXT_FONT_FAMILY = 'VGEmbeddedText'
const MP4_AUDIO_COPY_CODECS = new Set(['aac', 'alac', 'mp3', 'ac3', 'eac3'])
const EMOJI_IMAGE_BOX_RATIO = 1.12
const EMOJI_BASELINE_SHIFT_RATIO = 0.86
const fontkit = fontkitModule as unknown as { openSync: (path: string) => any }
const runtimeRequire = createRequire(import.meta.url)
const overlayGenerationLocks = new Map<string, Promise<string>>()

/** 预览目录名：用来源 id 的短哈希（来源 id 可能带 64 位文件哈希，整段当目录名会超出 Windows 路径长度） */
function shortPreviewKey(sourceItem: Pick<BatchSubtitleSourceItem, 'id' | 'sourceVideoPath'>) {
  return createHash('sha1').update(String(sourceItem.id || sourceItem.sourceVideoPath || randomUUID())).digest('hex').slice(0, 16)
}

function createOverlayCacheKey(selectedTitle: string, styleConfig: BatchSubtitleStyleConfig) {
  const payload = JSON.stringify({
    // Bump when the overlay layout changes so old cached overlays are not reused (2: titles wrap to the box width;
    // 3: shared layout with the page preview, shrinks the text to fit maxLines).
    layoutVersion: 4,
    selectedTitle: String(selectedTitle || '').trim(),
    styleConfig: {
      fontName: styleConfig.fontName,
      fontSize: styleConfig.fontSize,
      fontColor: styleConfig.fontColor,
      strokeColor: styleConfig.strokeColor,
      strokeWidth: styleConfig.strokeWidth,
      shadowColor: styleConfig.shadowColor,
      shadowBlur: styleConfig.shadowBlur,
      position: styleConfig.position,
      safeMargin: styleConfig.safeMargin,
      textAlign: styleConfig.textAlign,
      maxLines: styleConfig.maxLines,
      maxWidthRatio: styleConfig.maxWidthRatio,
      lineGap: styleConfig.lineGap,
      bottomMargin: styleConfig.bottomMargin,
      lineMode: styleConfig.lineMode,
      fontWeight: styleConfig.fontWeight,
      offsetYRatio: styleConfig.offsetYRatio,
      shiftYPx: styleConfig.shiftYPx,
      offsetXRatio: styleConfig.offsetXRatio,
      secondaryScale: styleConfig.secondaryScale,
    },
  })
  return createHash('sha1').update(payload).digest('hex')
}

function resolveVideoNormalizeFilter(sourceItem: Pick<BatchSubtitleSourceItem, 'width' | 'height'>) {
  const width = Math.max(0, Number(sourceItem.width || 0))
  const height = Math.max(0, Number(sourceItem.height || 0))
  if (width === CANVAS_WIDTH && height === CANVAS_HEIGHT) {
    return 'setsar=1'
  }
  return NORMALIZE_VIDEO_FILTER
}

async function ensureCachedOverlayImage(input: {
  sourceItem: BatchSubtitleSourceItem
  titleConfig: BatchSubtitleTitleConfig
  styleConfig: BatchSubtitleStyleConfig
  overlayCacheDir: string
  cachedOverlayImagePath: string
}) {
  const hasCachedOverlay = await stat(input.cachedOverlayImagePath)
    .then((fileStat) => fileStat.isFile())
    .catch(() => false)
  if (hasCachedOverlay) return input.cachedOverlayImagePath

  const lockKey = input.cachedOverlayImagePath
  const existingLock = overlayGenerationLocks.get(lockKey)
  if (existingLock) {
    return await existingLock
  }

  const lockPromise = (async () => {
    const generated = await generateBatchSubtitleOverlayAssets({
      sourceItem: input.sourceItem,
      titleConfig: input.titleConfig,
      styleConfig: input.styleConfig,
      workDir: input.overlayCacheDir,
    })
    return generated.overlayImagePath
  })()

  overlayGenerationLocks.set(lockKey, lockPromise)
  try {
    return await lockPromise
  } finally {
    overlayGenerationLocks.delete(lockKey)
  }
}

function escapeXml(input: string) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function normalizeSelectedTitle(titleConfig: BatchSubtitleTitleConfig) {
  if (titleConfig.strategy === 'random_pool') {
    return String(titleConfig.titlePool[0] || '').trim()
  }
  return String(titleConfig.singleText || '').trim()
}

function isEmojiChar(char: string) {
  return /\p{Extended_Pictographic}/u.test(char) || /\p{Emoji_Presentation}/u.test(char)
}

function splitRuns(text: string): SubtitleSceneRun[] {
  const chars = Array.from(String(text || ''))
  const runs: SubtitleSceneRun[] = []
  for (const char of chars) {
    const kind = isEmojiChar(char) ? 'emoji' : 'text'
    const last = runs[runs.length - 1]
    if (kind === 'emoji') {
      runs.push({ text: char, kind })
    } else if (last && last.kind === kind) {
      last.text += char
    } else {
      runs.push({ text: char, kind })
    }
  }
  return runs
}

function toEmojiCodepointSequence(value: string) {
  return Array.from(String(value || ''))
    .map((char) => char.codePointAt(0)?.toString(16))
    .filter((hex) => hex && hex !== 'fe0f')
    .join('-')
}

async function readCachedEmojiDataUri(emoji: string) {
  const sequence = toEmojiCodepointSequence(emoji)
  if (!sequence) return null
  // 先用随软件带的（离线、国内网络也能用），没有再去 CDN 下载
  const bundled = bundledEmojiDir()
  if (bundled) {
    try {
      const svg = await readFile(join(bundled, `${sequence}.svg`), 'utf8')
      return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
    } catch {
      // 不在常用表情里
    }
  }
  const cacheDir = join(getAppPaths().dataDir, 'emoji-cache', 'twemoji-svg')
  const cachePath = join(cacheDir, `${sequence}.svg`)
  try {
    const cached = await readFile(cachePath, 'utf8')
    return `data:image/svg+xml;base64,${Buffer.from(cached, 'utf8').toString('base64')}`
  } catch {
    // continue to fetch
  }
  try {
    const response = await fetch(`https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${sequence}.svg`)
    if (!response.ok) return null
    const svg = await response.text()
    if (!svg.trim()) return null
    await mkdir(cacheDir, { recursive: true })
    await writeFile(cachePath, svg, 'utf8')
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
  } catch {
    return null
  }
}

function measureTextWidth(text: string, fontPath: string | null, fontSize: number) {
  if (!text) return 0
  if (!fontPath) return Math.round(text.length * fontSize)
  try {
    const font = fontkit.openSync(fontPath)
    const layout = font.layout(text)
    const advanceWidth = layout.glyphs.reduce((sum: number, glyph: any, index: number) => {
      const xAdvance = Number(layout.positions[index]?.xAdvance ?? glyph.advanceWidth ?? 0)
      return sum + xAdvance
    }, 0)
    const unitsPerEm = Number(font.unitsPerEm || 1000)
    return Math.max(0, (advanceWidth / unitsPerEm) * fontSize)
  } catch {
    return Math.round(text.length * fontSize)
  }
}

/**
 * 用字体文件里的字形轮廓画一段文字（不依赖系统字体，服务器上也一样）。分三层返回，整行画完再叠：
 * 阴影 → 描边 → 文字本身，避免后一个字的描边盖住前一个字。boldPx > 0 时用同色描边模拟加粗。
 */
function buildFontPathNodes(input: {
  text: string
  fontPath: string | null
  fontSize: number
  x: number
  baselineY: number
  fill: string
  stroke: string
  strokeWidth: number
  shadowColor: string
  shadowOffset: number
  boldPx: number
}): { shadow: string; outline: string; fill: string } | null {
  if (!input.text || !input.fontPath) return null
  try {
    const font = fontkit.openSync(input.fontPath)
    const layout = font.layout(input.text)
    const unitsPerEm = Number(font.unitsPerEm || 1000)
    const scale = input.fontSize / Math.max(1, unitsPerEm)
    let cursorX = 0
    const shadow: string[] = []
    const outline: string[] = []
    const fill: string[] = []
    for (let index = 0; index < layout.glyphs.length; index += 1) {
      const glyph = layout.glyphs[index]
      const position = layout.positions[index] || {}
      const advanceWidth = Number(position.xAdvance ?? glyph.advanceWidth ?? 0)
      const xOffset = Number(position.xOffset ?? 0)
      const yOffset = Number(position.yOffset ?? 0)
      const pathData = glyph.path?.toSVG?.()
      if (!pathData) {
        cursorX += advanceWidth
        continue
      }
      const glyphX = input.x + (cursorX + xOffset) * scale
      const glyphY = input.baselineY - yOffset * scale
      const transform = `translate(${glyphX} ${glyphY}) scale(${scale} -${scale})`
      const shadowTransform = `translate(${glyphX} ${glyphY + input.shadowOffset}) scale(${scale} -${scale})`
      const body = input.boldPx > 0 ? ` stroke="${escapeXml(input.fill)}" stroke-width="${input.boldPx}" stroke-linejoin="round" vector-effect="non-scaling-stroke"` : ' stroke="none"'
      shadow.push(`<path d="${pathData}" transform="${shadowTransform}" fill="${escapeXml(input.shadowColor)}"${input.boldPx > 0 ? ` stroke="${escapeXml(input.shadowColor)}" stroke-width="${input.boldPx}" vector-effect="non-scaling-stroke"` : ''} />`)
      if (input.strokeWidth > 0) {
        outline.push(
          `<path d="${pathData}" transform="${transform}" fill="${escapeXml(input.stroke)}" stroke="${escapeXml(input.stroke)}" stroke-width="${input.strokeWidth + input.boldPx}" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />`,
        )
      }
      fill.push(`<path d="${pathData}" transform="${transform}" fill="${escapeXml(input.fill)}"${body} />`)
      cursorX += advanceWidth
    }
    return { shadow: shadow.join(''), outline: outline.join(''), fill: fill.join('') }
  } catch {
    return null
  }
}

async function readFontDataUri(fontPath: string | null, mimeType: string) {
  if (!fontPath) return null
  try {
    const buffer = await readFile(fontPath)
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

async function rasterizeSvgToPng(svgContent: string, pngPath: string) {
  let sharpError = ''
  try {
    const sharpModule = runtimeRequire('sharp') as any
    const sharpFactory = sharpModule?.default || sharpModule
    if (typeof sharpFactory !== 'function') {
      throw new Error('sharp factory is unavailable')
    }
    await sharpFactory(Buffer.from(svgContent, 'utf8')).png().toFile(pngPath)
    return
  } catch (error: any) {
    sharpError = String(error?.message || error || 'unknown sharp error')
  }
  try {
    const { nativeImage } = await import('electron')
    const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgContent, 'utf8').toString('base64')}`
    const img = nativeImage.createFromDataURL(svgDataUrl)
    const pngBuffer = img.toPNG()
    if (pngBuffer.length > 0) {
      await writeFile(pngPath, pngBuffer)
      return
    }
    throw new Error('electron nativeImage returned empty PNG buffer')
  } catch (error: any) {
    const nativeImageError = String(error?.message || error || 'unknown nativeImage error')
    throw new Error(`Failed to rasterize subtitle overlay image | sharp: ${sharpError} | nativeImage: ${nativeImageError}`)
  }
}

async function resolveEmbeddedFontFaces(styleConfig: BatchSubtitleStyleConfig) {
  const resolvedTextFont = resolveSubtitleRenderFont(styleConfig.fontName)
  const textFontMime = /\.otf$/i.test(String(resolvedTextFont.path || '')) ? 'font/otf' : 'font/ttf'
  const textFontDataUri = await readFontDataUri(resolvedTextFont.path, textFontMime)
  const emojiFontPath =
    join(process.cwd(), 'resources', 'fonts', 'NotoColorEmoji.ttf')
  const emojiFontDataUri = await readFontDataUri(emojiFontPath, 'font/ttf')
  return {
    textFontDataUri,
    emojiFontDataUri,
    textFamilyCss: textFontDataUri ? PROJECT_TEXT_FONT_FAMILY : `${escapeXml(resolvedTextFont.family)},${DEFAULT_TEXT_FONT_FALLBACK}`,
    emojiFamilyCss: emojiFontDataUri ? PROJECT_EMOJI_FONT_FAMILY : DEFAULT_EMOJI_FONT_FALLBACK,
    embeddedTextFamily: resolvedTextFont.family,
  }
}

async function resolveSubtitleAudioArgs(sourceVideoPath: string) {
  const probe = await probeMedia(sourceVideoPath)
  if (typeof probe.audioStreamIndex !== 'number' || !Number.isFinite(probe.audioStreamIndex)) {
    return ['-an']
  }
  const audioMapArgs = ['-map', `0:${probe.audioStreamIndex}`]
  const codec = String(probe.audioCodec || '').trim().toLowerCase()
  if (codec && MP4_AUDIO_COPY_CODECS.has(codec)) {
    return [...audioMapArgs, '-c:a', 'copy']
  }
  return [...audioMapArgs, '-c:a', 'aac', '-b:a', '128k']
}

function batchSubtitleBitmapEncodeArgs(mode: 'preview' | 'output') {
  if (mode === 'preview') {
    return ['-c:v', 'libx264', '-preset', 'superfast', '-crf', '26'] as string[]
  }
  return ['-c:v', 'libx264', '-preset', 'superfast', '-crf', '23'] as string[]
}

/** Width of a piece of title text as drawn (emoji are drawn as square images). */
function measureTitleText(text: string, fontPath: string | null, fontSize: number) {
  return splitRuns(text).reduce((sum, run) => sum + (run.kind === 'emoji' ? Math.round(fontSize * EMOJI_IMAGE_BOX_RATIO) : measureTextWidth(run.text, fontPath, fontSize)), 0)
}

function buildSubtitleSceneSpec(selectedTitle: string, styleConfig: BatchSubtitleStyleConfig): SubtitleSceneSpec {
  // Line breaks, sizes and the maxLines shrink come from the layout shared with the page's live preview
  // (shared/subtitleTitleLayout.ts), so the rendered video matches what the user saw.
  const safeMarginPx = Math.max(48, Math.min(360, 180 + Math.round(styleConfig.safeMargin * 12)))
  const bottomMarginPx = Math.max(48, Math.min(900, Math.round(styleConfig.bottomMargin || 220)))
  const lineGapPx = Math.max(0, Math.min(40, Math.round(styleConfig.lineGap || 8)))
  const fontPath = resolveSubtitleRenderFont(styleConfig.fontName).path
  const layout = layoutTitle(selectedTitle, styleConfig, (text, size) => measureTitleText(text, fontPath, size))
  const firstLine = layout.lines[0]
  const startY = firstLine ? firstLine.baselineY - firstLine.lineHeight : safeMarginPx
  const lines = layout.lines.map((line) => ({
    runs: splitRuns(line.text),
    role: line.secondary ? ('secondary' as const) : ('primary' as const),
    fontSize: line.fontSize,
    lineHeight: line.lineHeight,
    x: line.x,
  }))
  return {
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
    videoFitMode: 'contain_pad',
    anchor: styleConfig.position,
    alignment: styleConfig.textAlign,
    safeMarginPx,
    bottomMarginPx,
    fontFamily: styleConfig.fontName,
    fontColor: styleConfig.fontColor,
    strokeColor: styleConfig.strokeColor,
    strokeWidth: Math.max(0, Number(styleConfig.strokeWidth || 0)),
    shadowColor: styleConfig.shadowColor,
    shadowBlur: Math.max(0, Number(styleConfig.shadowBlur || 0)),
    lineGapPx,
    lines,
    startY,
    boldPx: titleBoldPx(styleConfig.fontWeight, layout.lines[0]?.fontSize ?? styleConfig.fontSize),
  }
}

function resolveX(textAlign: BatchSubtitleStyleConfig['textAlign'], safeMarginPx: number) {
  if (textAlign === 'left') return safeMarginPx
  if (textAlign === 'right') return CANVAS_WIDTH - safeMarginPx
  return CANVAS_WIDTH / 2
}

async function buildSubtitleOverlaySvg(
  scene: SubtitleSceneSpec,
  styleConfig: BatchSubtitleStyleConfig,
  options?: { rasterizeFriendly?: boolean },
) {
  const gap = scene.lineGapPx
  const totalHeight = scene.lines.reduce((sum, line) => sum + line.lineHeight, 0) + gap * Math.max(0, scene.lines.length - 1)
  const x = resolveX(scene.alignment, 72)
  void totalHeight
  const startY = scene.startY
  const shadowId = `shadow-${randomUUID()}`
  const embeddedFonts = options?.rasterizeFriendly ? null : await resolveEmbeddedFontFaces(styleConfig)
  const resolvedTextFont = resolveSubtitleRenderFont(styleConfig.fontName)
  let currentY = startY
  const textNodes: string[] = []
  const shadowLayer: string[] = []
  const outlineLayer: string[] = []
  const fillLayer: string[] = []
  // 阴影：往下偏一点，模糊程度跟「阴影模糊」走（以前固定不模糊，和页面预览不一致）
  const shadowOffset = Math.max(2, Math.round(scene.strokeWidth * 0.45 + scene.shadowBlur * 0.15))
  for (const line of scene.lines) {
    const fontSize = line.fontSize
    const lineHeight = line.lineHeight
    const baselineY = currentY + lineHeight
    currentY += lineHeight + gap
    const drawRuns: Array<SubtitleDrawRun & { dataUri?: string | null }> = []
    for (const run of line.runs) {
      if (run.kind === 'emoji') {
        const size = Math.round(fontSize * EMOJI_IMAGE_BOX_RATIO)
        drawRuns.push({
          kind: 'emoji',
          text: run.text,
          width: size,
          height: size,
          dataUri: await readCachedEmojiDataUri(run.text),
        })
        continue
      }
      drawRuns.push({
        kind: 'text',
        text: run.text,
        width: measureTextWidth(run.text, resolvedTextFont.path, fontSize),
        height: fontSize,
      })
    }
    const lineWidth = drawRuns.reduce((sum, run) => sum + run.width, 0)
    void lineWidth
    void x
    let cursorX = line.x
    for (const run of drawRuns) {
      if (options?.rasterizeFriendly) {
        // 表情：文字字体里没有表情，画成 Twemoji 图片（以前会画成空白 / 方块）
        if (run.kind === 'emoji') {
          if (run.dataUri) {
            const size = run.width
            fillLayer.push(`<image href="${run.dataUri}" x="${cursorX}" y="${baselineY - size * EMOJI_BASELINE_SHIFT_RATIO}" width="${size}" height="${size}" />`)
          }
          cursorX += run.width
          continue
        }
        const pathNodes = buildFontPathNodes({
          text: run.text,
          fontPath: resolvedTextFont.path,
          fontSize,
          x: cursorX,
          baselineY,
          fill: scene.fontColor,
          stroke: scene.strokeColor,
          strokeWidth: scene.strokeWidth,
          shadowColor: scene.shadowColor,
          shadowOffset,
          boldPx: scene.boldPx,
        })
        if (pathNodes) {
          shadowLayer.push(pathNodes.shadow)
          outlineLayer.push(pathNodes.outline)
          fillLayer.push(pathNodes.fill)
          cursorX += run.width
          continue
        }
      }
      const textFamily =
        options?.rasterizeFriendly || !embeddedFonts
          ? escapeXml(resolvedTextFont.family || styleConfig.fontName || 'sans-serif')
          : run.kind === 'emoji'
            ? embeddedFonts.emojiFamilyCss
            : embeddedFonts.textFamilyCss
      textNodes.push(
        `<text x="${cursorX}" y="${baselineY}" text-anchor="start" font-family="${textFamily}" font-size="${fontSize}" font-weight="900" fill="${escapeXml(scene.fontColor)}" stroke="${escapeXml(scene.strokeColor)}" stroke-width="${scene.strokeWidth}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke fill"${options?.rasterizeFriendly ? '' : ` filter="url(#${shadowId})"`}>${escapeXml(run.text)}</text>`,
      )
      cursorX += run.width
    }
  }
  const fontFaceCss =
    options?.rasterizeFriendly || !embeddedFonts
      ? ''
      : [
          embeddedFonts.textFontDataUri
            ? `@font-face { font-family: '${PROJECT_TEXT_FONT_FAMILY}'; src: url('${embeddedFonts.textFontDataUri}') format('${/\.otf$/i.test(String(resolveSubtitleRenderFont(styleConfig.fontName).path || '')) ? 'opentype' : 'truetype'}'); font-weight: 100 900; }`
            : '',
          embeddedFonts.emojiFontDataUri
            ? `@font-face { font-family: '${PROJECT_EMOJI_FONT_FAMILY}'; src: url('${embeddedFonts.emojiFontDataUri}') format('truetype'); font-weight: 400; }`
            : '',
        ]
          .filter(Boolean)
          .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">
  <defs>${options?.rasterizeFriendly ? `
    <filter id="${shadowId}" x="-10%" y="-30%" width="120%" height="160%">
      <feGaussianBlur stdDeviation="${Math.max(0.6, scene.shadowBlur / 3)}" />
    </filter>` : `
    <style><![CDATA[
${fontFaceCss}
    ]]></style>
    <filter id="${shadowId}" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="${scene.shadowBlur / 2}" flood-color="${escapeXml(scene.shadowColor)}" flood-opacity="0.95" />
    </filter>`}
  </defs>
  <rect width="100%" height="100%" fill="transparent" />
  ${shadowLayer.length && scene.shadowBlur > 0 ? `<g filter="url(#${shadowId})" opacity="0.55">${shadowLayer.join('')}</g>` : shadowLayer.length ? `<g opacity="0.34">${shadowLayer.join('')}</g>` : ''}
  ${outlineLayer.join('')}
  ${fillLayer.join('')}
  ${textNodes.join('')}
</svg>`
}

export async function generateBatchSubtitleOverlayAssets(input: {
  sourceItem: BatchSubtitleSourceItem
  titleConfig: BatchSubtitleTitleConfig
  styleConfig: BatchSubtitleStyleConfig
  workDir?: string
}) {
  const selectedTitle = normalizeSelectedTitle(input.titleConfig)
  const scene = buildSubtitleSceneSpec(selectedTitle, input.styleConfig)
  const previewRoot = shortPreviewKey(input.sourceItem)
  const rootDir = input.workDir || join(getAppPaths().dataDir, 'batch-subtitle-preview', previewRoot)
  await mkdir(rootDir, { recursive: true })
  const svgPath = join(rootDir, 'overlay.svg')
  const pngPath = join(rootDir, 'overlay.png')
  const svgContent = await buildSubtitleOverlaySvg(scene, input.styleConfig, { rasterizeFriendly: true })
  await writeFile(svgPath, svgContent, 'utf8')
  await rasterizeSvgToPng(svgContent, pngPath)
  return {
    selectedTitle,
    scene,
    svgPath,
    overlayImagePath: pngPath,
  }
}

export async function generateBatchSubtitlePreviewFrame(input: {
  sourceItem: BatchSubtitleSourceItem
  titleConfig: BatchSubtitleTitleConfig
  styleConfig: BatchSubtitleStyleConfig
  previewAtSec?: number
  /** 也做一段几秒的预览视频（默认只出一张画面，快很多） */
  includeVideo?: boolean
}) {
  const stamp = Date.now().toString(36)
  const previewRoot = join(getAppPaths().dataDir, 'batch-subtitle-preview', shortPreviewKey(input.sourceItem))
  // 每个视频只留最新一次预览，旧的删掉，不让预览文件越堆越多
  await rm(previewRoot, { recursive: true, force: true }).catch(() => undefined)
  const previewDir = join(previewRoot, stamp)
  await mkdir(previewDir, { recursive: true })
  const { overlayImagePath } = await generateBatchSubtitleOverlayAssets({
    sourceItem: input.sourceItem,
    titleConfig: input.titleConfig,
    styleConfig: input.styleConfig,
    workDir: previewDir,
  })
  const previewImagePath = join(previewDir, `${basename(input.sourceItem.sourceVideoPath).replace(/\.[^.]+$/, '')}_preview.png`)
  const previewVideoPath = join(previewDir, `${basename(input.sourceItem.sourceVideoPath).replace(/\.[^.]+$/, '')}_preview.mp4`)
  const mediaInfo = await getMediaInfo(input.sourceItem.sourceVideoPath)
  const previewAtSec =
    typeof input.previewAtSec === 'number'
      ? input.previewAtSec
      : mediaInfo.durationSec >= 1
        ? 1
        : Math.max(0, Math.min(0.5, mediaInfo.durationSec / 2 || 0.2))
  const previewDuration = Math.max(1.5, Math.min(3, Math.max(0.8, Number(mediaInfo.durationSec || 2))))
  const normalizeVideoFilter = resolveVideoNormalizeFilter(input.sourceItem)
  await runFfmpeg({
    args: [
      '-y',
      '-ss',
      `${previewAtSec}`,
      '-i',
      input.sourceItem.sourceVideoPath,
      '-i',
      overlayImagePath,
      '-frames:v',
      '1',
      '-filter_complex',
      `[0:v]${normalizeVideoFilter}[base];[base][1:v]overlay=0:0,format=rgba[outv]`,
      '-map',
      '[outv]',
      previewImagePath,
    ],
  })
  if (input.includeVideo !== false) await runFfmpeg({
    args: [
      '-y',
      '-ss',
      `${previewAtSec}`,
      '-t',
      `${previewDuration}`,
      '-i',
      input.sourceItem.sourceVideoPath,
      '-i',
      overlayImagePath,
      '-filter_complex',
      `[0:v]${normalizeVideoFilter}[base];[base][1:v]overlay=0:0,format=yuv420p[outv]`,
      '-map',
      '[outv]',
      '-map',
      '0:a?',
      '-threads',
      '2',
      ...batchSubtitleBitmapEncodeArgs('preview'),
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      previewVideoPath,
    ],
  })
  return {
    sourceItemId: input.sourceItem.id,
    previewImagePath,
    overlayImagePath,
    previewVideoPath: input.includeVideo !== false ? previewVideoPath : undefined,
    previewPosterPath: previewImagePath,
    generatedAt: Date.now(),
  }
}

export async function renderBatchSubtitleVideoWithBitmapOverlay(input: {
  sourceItem: BatchSubtitleSourceItem
  titleConfig: BatchSubtitleTitleConfig
  styleConfig: BatchSubtitleStyleConfig
  outputDir: string
  ffmpegThreads?: number
}) {
  const itemDir = join(input.outputDir, String(input.sourceItem.id || randomUUID()).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_'))
  await mkdir(itemDir, { recursive: true })
  const selectedTitle = normalizeSelectedTitle(input.titleConfig)
  const overlayCacheDir = join(input.outputDir, '_overlay-cache', createOverlayCacheKey(selectedTitle, input.styleConfig))
  const cachedOverlayImagePath = join(overlayCacheDir, 'overlay.png')
  const overlayImagePath = await ensureCachedOverlayImage({
    sourceItem: input.sourceItem,
    titleConfig: input.titleConfig,
    styleConfig: input.styleConfig,
    overlayCacheDir,
    cachedOverlayImagePath,
  })
  const outputVideoPath = join(itemDir, `${basename(input.sourceItem.sourceVideoPath).replace(/\.[^.]+$/, '')}_subtitle.mp4`)
  const normalizeVideoFilter = resolveVideoNormalizeFilter(input.sourceItem)
  const audioArgs = await resolveSubtitleAudioArgs(input.sourceItem.sourceVideoPath)
  await runFfmpeg({
    args: [
      '-y',
      '-i',
      input.sourceItem.sourceVideoPath,
      '-i',
      overlayImagePath,
      '-filter_complex',
      `[0:v]${normalizeVideoFilter}[base];[base][1:v]overlay=0:0,format=yuv420p[outv]`,
      '-map',
      '[outv]',
      ...audioArgs,
      '-threads',
      `${Math.max(1, Math.floor(Number(input.ffmpegThreads || 1)))}`,
      ...batchSubtitleBitmapEncodeArgs('output'),
      outputVideoPath,
    ],
  })
  return {
    itemDir,
    outputVideoPath,
    overlayImagePath,
    selectedTitle,
  }
}
