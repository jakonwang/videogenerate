import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { nativeImage } from 'electron'
import * as fontkitModule from 'fontkit'
import { getAppPaths } from '../../lib/paths'
import { prepareFontsDirForSubtitles, resolveSubtitleRenderFont } from '../../lib/fontResolve'
import { getMediaInfo } from '../media/info'
import { runFfmpeg } from '../ffmpeg/runner'
import { renderBatchSubtitleOverlayStillByRemotion } from './batchSubtitleRemotion'
import type { BatchSubtitleSourceItem, BatchSubtitleStyleConfig, BatchSubtitleTitleConfig } from './types'

const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1920
const NORMALIZE_VIDEO_FILTER =
  'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black'

type SubtitleSceneLine = {
  runs: SubtitleSceneRun[]
  role: 'primary' | 'secondary'
  fontSize: number
  lineHeight: number
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
  fontFamily: string
  fontColor: string
  strokeColor: string
  strokeWidth: number
  shadowColor: string
  shadowBlur: number
  lines: SubtitleSceneLine[]
}

const DEFAULT_TEXT_FONT_FALLBACK =
  "'Noto Sans SC','Microsoft YaHei','PingFang SC','Source Han Sans SC','Noto Sans',sans-serif"
const DEFAULT_EMOJI_FONT_FALLBACK =
  "'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji','Segoe UI Symbol','Noto Sans Symbols 2',sans-serif"
const PROJECT_EMOJI_FONT_FAMILY = 'VGEmbeddedEmoji'
const PROJECT_TEXT_FONT_FAMILY = 'VGEmbeddedText'
const EMOJI_IMAGE_BOX_RATIO = 1.12
const EMOJI_BASELINE_SHIFT_RATIO = 0.86
const fontkit = fontkitModule as unknown as { openSync: (path: string) => any }

function sanitizePathSegment(value: string, fallback: string) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || fallback
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

function splitPreviewLines(selectedTitle: string, lineMode: BatchSubtitleStyleConfig['lineMode']) {
  const lines = String(selectedTitle || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lineMode === 'single') {
    return lines.slice(0, 1).map((text) => ({ text, secondary: false }))
  }
  return lines.slice(0, 4).map((text, index) => ({ text, secondary: index > 0 }))
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
    .filter(Boolean)
    .join('-')
}

async function readCachedEmojiDataUri(emoji: string) {
  const sequence = toEmojiCodepointSequence(emoji)
  if (!sequence) return null
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

async function readFontDataUri(fontPath: string | null, mimeType: string) {
  if (!fontPath) return null
  try {
    const buffer = await readFile(fontPath)
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  } catch {
    return null
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

function buildSubtitleSceneSpec(selectedTitle: string, styleConfig: BatchSubtitleStyleConfig): SubtitleSceneSpec {
  const mainSize = Math.max(18, Math.min(160, Math.round(styleConfig.fontSize)))
  const secondarySize = Math.max(16, Math.round(mainSize * 0.68))
  const safeMarginPx = Math.max(48, Math.min(360, 180 + Math.round(styleConfig.safeMargin * 12)))
  const lines = splitPreviewLines(selectedTitle, styleConfig.lineMode).map((line) => {
    const fontSize = line.secondary ? secondarySize : mainSize
    const lineHeight = Math.round(fontSize * (line.secondary ? 1.12 : 1.08))
    return {
      runs: splitRuns(line.text),
      role: line.secondary ? ('secondary' as const) : ('primary' as const),
      fontSize,
      lineHeight,
    }
  })
  return {
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
    videoFitMode: 'contain_pad',
    anchor: styleConfig.position,
    alignment: styleConfig.textAlign,
    safeMarginPx,
    fontFamily: styleConfig.fontName,
    fontColor: styleConfig.fontColor,
    strokeColor: styleConfig.strokeColor,
    strokeWidth: Math.max(0, Number(styleConfig.strokeWidth || 0)),
    shadowColor: styleConfig.shadowColor,
    shadowBlur: Math.max(0, Number(styleConfig.shadowBlur || 0)),
    lines,
  }
}

function resolveX(textAlign: BatchSubtitleStyleConfig['textAlign'], safeMarginPx: number) {
  if (textAlign === 'left') return safeMarginPx
  if (textAlign === 'right') return CANVAS_WIDTH - safeMarginPx
  return CANVAS_WIDTH / 2
}

function resolveY(position: BatchSubtitleStyleConfig['position'], safeMarginPx: number, totalHeight: number) {
  if (position === 'center') return Math.round((CANVAS_HEIGHT - totalHeight) / 2)
  if (position === 'bottom') return CANVAS_HEIGHT - safeMarginPx - totalHeight
  return safeMarginPx
}

async function buildSubtitleOverlaySvg(scene: SubtitleSceneSpec, styleConfig: BatchSubtitleStyleConfig) {
  const gap = Math.max(8, Math.round((scene.lines[0]?.fontSize || 48) * 0.06))
  const totalHeight = scene.lines.reduce((sum, line) => sum + line.lineHeight, 0) + gap * Math.max(0, scene.lines.length - 1)
  const x = resolveX(scene.alignment, 72)
  const startY = resolveY(scene.anchor, scene.safeMarginPx, totalHeight)
  const shadowId = `shadow-${randomUUID()}`
  const embeddedFonts = await resolveEmbeddedFontFaces(styleConfig)
  const resolvedTextFont = resolveSubtitleRenderFont(styleConfig.fontName)
  let currentY = startY
  const textNodes: string[] = []
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
    let cursorX =
      scene.alignment === 'left'
        ? x
        : scene.alignment === 'right'
          ? x - lineWidth
          : x - lineWidth / 2
    for (const run of drawRuns) {
      if (run.kind === 'emoji' && run.dataUri) {
        const imageY = baselineY - run.height * EMOJI_BASELINE_SHIFT_RATIO
        textNodes.push(
          `<image href="${run.dataUri}" x="${cursorX}" y="${imageY}" width="${run.width}" height="${run.height}" preserveAspectRatio="xMidYMid meet" filter="url(#${shadowId})" />`,
        )
        cursorX += run.width
        continue
      }
      const textFamily = run.kind === 'emoji' ? embeddedFonts.emojiFamilyCss : embeddedFonts.textFamilyCss
      textNodes.push(
        `<text x="${cursorX}" y="${baselineY}" text-anchor="start" font-family="${textFamily}" font-size="${fontSize}" font-weight="900" fill="${escapeXml(scene.fontColor)}" stroke="${escapeXml(scene.strokeColor)}" stroke-width="${scene.strokeWidth}" paint-order="stroke fill" filter="url(#${shadowId})">${escapeXml(run.text)}</text>`,
      )
      cursorX += run.width
    }
  }
  const fontFaceCss = [
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
  <defs>
    <style><![CDATA[
${fontFaceCss}
    ]]></style>
    <filter id="${shadowId}" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="${scene.shadowBlur / 2}" flood-color="${escapeXml(scene.shadowColor)}" flood-opacity="0.95" />
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="transparent" />
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
  const previewRoot = sanitizePathSegment(input.sourceItem.id || basename(input.sourceItem.sourceVideoPath), randomUUID())
  const rootDir = input.workDir || join(getAppPaths().dataDir, 'batch-subtitle-preview', previewRoot)
  await mkdir(rootDir, { recursive: true })
  const svgPath = join(rootDir, 'overlay.svg')
  const pngPath = join(rootDir, 'overlay.png')
  const svgContent = await buildSubtitleOverlaySvg(scene, input.styleConfig)
  await writeFile(svgPath, svgContent, 'utf8')
  const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgContent, 'utf8').toString('base64')}`
  const img = nativeImage.createFromDataURL(svgDataUrl)
  const pngBuffer = img.toPNG()
  if (pngBuffer.length > 0) {
    await writeFile(pngPath, pngBuffer)
  } else {
    await renderBatchSubtitleOverlayStillByRemotion({
      outputPath: pngPath,
      selectedTitle,
      styleConfig: input.styleConfig,
    })
  }
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
}) {
  const stamp = `${Date.now()}-${randomUUID()}`
  const previewRoot = sanitizePathSegment(input.sourceItem.id || basename(input.sourceItem.sourceVideoPath), 'preview')
  const previewDir = join(getAppPaths().dataDir, 'batch-subtitle-preview', previewRoot, stamp)
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
      `[0:v]${NORMALIZE_VIDEO_FILTER}[base];[base][1:v]overlay=0:0,format=rgba[outv]`,
      '-map',
      '[outv]',
      previewImagePath,
    ],
  })
  await runFfmpeg({
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
      `[0:v]${NORMALIZE_VIDEO_FILTER}[base];[base][1:v]overlay=0:0,format=yuv420p[outv]`,
      '-map',
      '[outv]',
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '26',
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
    previewVideoPath,
    previewPosterPath: previewImagePath,
    generatedAt: Date.now(),
  }
}

export async function renderBatchSubtitleVideoWithBitmapOverlay(input: {
  sourceItem: BatchSubtitleSourceItem
  titleConfig: BatchSubtitleTitleConfig
  styleConfig: BatchSubtitleStyleConfig
  outputDir: string
}) {
  const itemDir = join(input.outputDir, String(input.sourceItem.id || randomUUID()).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_'))
  await mkdir(itemDir, { recursive: true })
  const { selectedTitle, overlayImagePath } = await generateBatchSubtitleOverlayAssets({
    sourceItem: input.sourceItem,
    titleConfig: input.titleConfig,
    styleConfig: input.styleConfig,
    workDir: itemDir,
  })
  const outputVideoPath = join(itemDir, `${basename(input.sourceItem.sourceVideoPath).replace(/\.[^.]+$/, '')}_subtitle.mp4`)
  await prepareFontsDirForSubtitles(itemDir)
  await runFfmpeg({
    args: [
      '-y',
      '-i',
      input.sourceItem.sourceVideoPath,
      '-i',
      overlayImagePath,
      '-filter_complex',
      `[0:v]${NORMALIZE_VIDEO_FILTER}[base];[base][1:v]overlay=0:0,format=yuv420p[outv]`,
      '-map',
      '[outv]',
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '20',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
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
