import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getAppPaths } from '../../lib/paths'
import { resolveSubtitleRenderFont } from '../../lib/fontResolve'
import { getMediaInfo } from '../media/info'
import { runFfmpeg } from '../ffmpeg/runner'
import type {
  BatchSubtitleOverlayImageConfig,
  BatchSubtitleSourceItem,
  BatchSubtitleStyleConfig,
  BatchSubtitleTitleConfig,
} from './types'

const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1920
const FPS = 30
const INTERMEDIATE_CODEC = 'prores'
const COMPOSITION_ID = 'BatchSubtitleOverlay'
const NORMALIZE_VIDEO_FILTER =
  'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black'

let bundleCachePromise: Promise<string> | null = null

type RemotionRun = {
  text: string
  kind: 'text' | 'emoji'
}

type RemotionPreviewLine = {
  text: string
  runs: RemotionRun[]
  secondary: boolean
}

function sanitizePathSegment(value: string, fallback: string) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || fallback
}

function resolveSubtitleCompositionEntry() {
  let electronAppPath = ''
  try {
    const electron = require('electron') as typeof import('electron')
    electronAppPath = String(electron?.app?.getAppPath?.() || '').trim()
  } catch {
    electronAppPath = ''
  }

  const appRootCandidates = [electronAppPath, process.cwd()].filter(Boolean)
  for (const appRoot of appRootCandidates) {
    const entryPoint = join(appRoot, 'src', 'main', 'modules', 'web-platform', 'remotion', 'subtitleComposition.tsx')
    if (existsSync(entryPoint)) {
      return {
        entryPoint,
        rootDir: appRoot,
      }
    }
  }

  const moduleLocalEntry = join(__dirname, 'remotion', 'subtitleComposition.tsx')
  if (existsSync(moduleLocalEntry)) {
    return {
      entryPoint: moduleLocalEntry,
      rootDir: dirname(dirname(dirname(dirname(__dirname)))),
    }
  }

  return {
    entryPoint: join(process.cwd(), 'src', 'main', 'modules', 'web-platform', 'remotion', 'subtitleComposition.tsx'),
    rootDir: process.cwd(),
  }
}

async function loadRemotionBundler() {
  return await import('@remotion/bundler')
}

async function loadRemotionRenderer() {
  return await import('@remotion/renderer')
}

function normalizeSelectedTitle(titleConfig: BatchSubtitleTitleConfig) {
  if (titleConfig.strategy === 'random_pool') {
    return String(titleConfig.titlePool[0] || '').trim()
  }
  return String(titleConfig.singleText || '').trim()
}

function splitPreviewLines(
  selectedTitle: string,
  config: Pick<BatchSubtitleStyleConfig, 'lineMode' | 'maxLines'>,
): RemotionPreviewLine[] {
  const maxLines = Math.max(1, Math.min(6, Number(config.maxLines || 2)))
  const lines = String(selectedTitle || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (config.lineMode === 'single') {
    return lines.slice(0, 1).map((text) => ({ text, runs: splitRuns(text), secondary: false }))
  }

  return lines.slice(0, maxLines).map((text, index) => ({
    text,
    runs: splitRuns(text),
    secondary: index > 0,
  }))
}

function isEmojiChar(char: string) {
  return /\p{Extended_Pictographic}/u.test(char) || /\p{Emoji_Presentation}/u.test(char)
}

function splitRuns(text: string): RemotionRun[] {
  const chars = Array.from(String(text || ''))
  const runs: RemotionRun[] = []
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

async function readFontDataUri(fontPath: string | null) {
  if (!fontPath) return null
  try {
    const buffer = await readFile(fontPath)
    const mime = /\.otf$/i.test(fontPath) ? 'font/otf' : 'font/ttf'
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
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

async function ensureSubtitleBundle() {
  if (!bundleCachePromise) {
    const { bundle } = await loadRemotionBundler()
    const { entryPoint, rootDir } = resolveSubtitleCompositionEntry()
    bundleCachePromise = bundle({
      entryPoint,
      webpackOverride: (config) => config,
      enableCaching: true,
      publicPath: null,
      rootDir,
      publicDir: null,
      onPublicDirCopyProgress: () => undefined,
      onSymlinkDetected: () => undefined,
      keyboardShortcutsEnabled: false,
      askAIEnabled: false,
      rspack: false,
      symlinkPublicDir: false,
      onProgress: () => undefined,
      ignoreRegisterRootWarning: true,
      onDirectoryCreated: () => undefined,
      gitSource: null,
      maxTimelineTracks: null,
      bufferStateDelayInMilliseconds: null,
      audioLatencyHint: null,
      experimentalClientSideRenderingEnabled: false,
      renderDefaults: null,
    })
  }
  return bundleCachePromise
}

async function buildInputProps(input: {
  selectedTitle: string
  styleConfig: BatchSubtitleStyleConfig
  overlayConfig?: Partial<BatchSubtitleOverlayImageConfig>
}) {
  const resolvedFont = resolveSubtitleRenderFont(input.styleConfig.fontName)
  const lines = splitPreviewLines(input.selectedTitle, input.styleConfig)
  const emojiChars = Array.from(new Set(lines.flatMap((line) => (line.runs || []).filter((run) => run.kind === 'emoji').map((run) => run.text))))
  const emojiMap: Record<string, string> = {}
  await Promise.all(
    emojiChars.map(async (emoji) => {
      const uri = await readCachedEmojiDataUri(emoji)
      if (uri) emojiMap[emoji] = uri
    }),
  )
  return {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    lines,
    fontFamily: resolvedFont.family || input.styleConfig.fontName,
    embeddedFontFamily: resolvedFont.family || input.styleConfig.fontName,
    embeddedFontDataUri: await readFontDataUri(resolvedFont.path),
    fontSize: input.overlayConfig?.fontSize || input.styleConfig.fontSize,
    fontColor: input.overlayConfig?.fontColor || input.styleConfig.fontColor,
    strokeColor: input.overlayConfig?.strokeColor || input.styleConfig.strokeColor,
    strokeWidth: input.overlayConfig?.strokeWidth || input.styleConfig.strokeWidth,
    shadowColor: input.overlayConfig?.shadowColor || input.styleConfig.shadowColor,
    shadowBlur: input.overlayConfig?.shadowBlur || input.styleConfig.shadowBlur,
    position: input.overlayConfig?.position || input.styleConfig.position,
    safeMargin: input.overlayConfig?.safeMargin || input.styleConfig.safeMargin,
    textAlign: input.overlayConfig?.textAlign || input.styleConfig.textAlign,
    lineGap: input.overlayConfig?.lineGap || input.styleConfig.lineGap || 8,
    maxWidthRatio: input.overlayConfig?.maxWidthRatio || input.styleConfig.maxWidthRatio || 0.72,
    bottomMargin: input.overlayConfig?.bottomMargin || input.styleConfig.bottomMargin || 220,
    emojiMap,
  }
}

async function selectSubtitleComposition(inputProps: Record<string, unknown>) {
  const { selectComposition } = await loadRemotionRenderer()
  const serveUrl = await ensureSubtitleBundle()
  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps,
  })
  return { composition, serveUrl }
}

async function renderRemotionIntermediateVideo(input: {
  outputPath: string
  durationInFrames: number
  selectedTitle: string
  styleConfig: BatchSubtitleStyleConfig
  overlayConfig?: Partial<BatchSubtitleOverlayImageConfig>
}) {
  const { renderMedia } = await loadRemotionRenderer()
  const inputProps = await buildInputProps({
    selectedTitle: input.selectedTitle,
    styleConfig: input.styleConfig,
    overlayConfig: input.overlayConfig,
  })
  const { composition, serveUrl } = await selectSubtitleComposition(inputProps)
  await renderMedia({
    serveUrl,
    composition: {
      ...composition,
      durationInFrames: Math.max(1, input.durationInFrames),
      fps: FPS,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    },
    inputProps,
    codec: INTERMEDIATE_CODEC,
    imageFormat: 'png',
    outputLocation: input.outputPath,
    overwrite: true,
    proResProfile: '4444',
    pixelFormat: 'yuva444p10le',
    chromiumOptions: {
      gl: 'swiftshader',
    },
    onProgress: () => undefined,
  })
}

async function renderRemotionStill(input: {
  outputPath: string
  selectedTitle: string
  styleConfig: BatchSubtitleStyleConfig
  overlayConfig?: Partial<BatchSubtitleOverlayImageConfig>
}) {
  const { renderStill } = await loadRemotionRenderer()
  const inputProps = await buildInputProps({
    selectedTitle: input.selectedTitle,
    styleConfig: input.styleConfig,
    overlayConfig: input.overlayConfig,
  })
  const { composition, serveUrl } = await selectSubtitleComposition(inputProps)
  await renderStill({
    composition,
    serveUrl,
    output: input.outputPath,
    imageFormat: 'png',
    overwrite: true,
    inputProps,
  })
}

async function muxRemotionVideoWithSource(input: {
  sourceVideoPath: string
  remotionVideoPath: string
  outputPath: string
}) {
  await runFfmpeg({
    args: [
      '-y',
      '-i',
      input.sourceVideoPath,
      '-i',
      input.remotionVideoPath,
      '-filter_complex',
      `[0:v]${NORMALIZE_VIDEO_FILTER}[base];[base][1:v]overlay=0:0:format=auto[vout]`,
      '-map',
      '[vout]',
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      input.outputPath,
    ],
  })
}

async function captureVideoPoster(input: {
  sourceVideoPath: string
  outputPath: string
  atSec: number
}) {
  await runFfmpeg({
    args: [
      '-y',
      '-ss',
      `${Math.max(0, input.atSec)}`,
      '-i',
      input.sourceVideoPath,
      '-frames:v',
      '1',
      input.outputPath,
    ],
  })
}

async function composeRemotionStillWithSource(input: {
  sourceVideoPath: string
  overlayImagePath: string
  outputPath: string
  atSec: number
}) {
  await runFfmpeg({
    args: [
      '-y',
      '-ss',
      `${Math.max(0, input.atSec)}`,
      '-i',
      input.sourceVideoPath,
      '-i',
      input.overlayImagePath,
      '-filter_complex',
      `[0:v]${NORMALIZE_VIDEO_FILTER}[base];[base][1:v]overlay=0:0:format=auto[vout]`,
      '-map',
      '[vout]',
      '-frames:v',
      '1',
      input.outputPath,
    ],
  })
}

export async function generateBatchSubtitlePreviewFrameByRemotion(input: {
  sourceItem: BatchSubtitleSourceItem
  titleConfig: BatchSubtitleTitleConfig
  styleConfig: BatchSubtitleStyleConfig
  overlayConfig?: Partial<BatchSubtitleOverlayImageConfig>
  previewAtSec?: number
  includeVideo?: boolean
}) {
  const stamp = `${Date.now()}-${randomUUID()}`
  const previewRoot = sanitizePathSegment(input.sourceItem.id || basename(input.sourceItem.sourceVideoPath), 'preview')
  const previewDir = join(getAppPaths().dataDir, 'batch-subtitle-preview', previewRoot, stamp)
  await mkdir(previewDir, { recursive: true })

  const selectedTitle = normalizeSelectedTitle(input.titleConfig)
  const previewImagePath = join(previewDir, `${basename(input.sourceItem.sourceVideoPath).replace(/\.[^.]+$/, '')}_preview.png`)
  const remotionStillPath = join(previewDir, 'remotion-preview.png')
  const remotionVideoPath = join(previewDir, 'remotion-preview.mov')
  const previewVideoPath = join(previewDir, `${basename(input.sourceItem.sourceVideoPath).replace(/\.[^.]+$/, '')}_preview.mp4`)

  const mediaInfo = await getMediaInfo(input.sourceItem.sourceVideoPath)
  const previewDuration = Math.max(1.5, Math.min(3, Math.max(0.8, Number(mediaInfo.durationSec || 2))))
  const durationInFrames = Math.max(1, Math.round(previewDuration * FPS))
  const previewAtSec = Math.min(1, Math.max(0, Number(input.previewAtSec || 0.8)))

  let finalPreviewVideoPath: string | undefined
  if (input.includeVideo) {
    await renderRemotionIntermediateVideo({
      outputPath: remotionVideoPath,
      durationInFrames,
      selectedTitle,
      styleConfig: input.styleConfig,
      overlayConfig: input.overlayConfig,
    })
    await muxRemotionVideoWithSource({
      sourceVideoPath: input.sourceItem.sourceVideoPath,
      remotionVideoPath,
      outputPath: previewVideoPath,
    })
    await captureVideoPoster({
      sourceVideoPath: previewVideoPath,
      outputPath: previewImagePath,
      atSec: Math.min(0.6, Math.max(0, previewDuration / 2)),
    })
    finalPreviewVideoPath = previewVideoPath
  } else {
    await renderRemotionStill({
      outputPath: remotionStillPath,
      selectedTitle,
      styleConfig: input.styleConfig,
      overlayConfig: input.overlayConfig,
    })
    await composeRemotionStillWithSource({
      sourceVideoPath: input.sourceItem.sourceVideoPath,
      overlayImagePath: remotionStillPath,
      outputPath: previewImagePath,
      atSec: previewAtSec,
    })
  }

  return {
    sourceItemId: input.sourceItem.id,
    previewImagePath,
    overlayImagePath: input.includeVideo ? remotionVideoPath : remotionStillPath,
    previewVideoPath: finalPreviewVideoPath,
    previewPosterPath: previewImagePath,
    generatedAt: Date.now(),
  }
}

export async function renderBatchSubtitleVideoWithRemotionIntermediate(input: {
  sourceItem: BatchSubtitleSourceItem
  titleConfig: BatchSubtitleTitleConfig
  styleConfig: BatchSubtitleStyleConfig
  overlayConfig?: Partial<BatchSubtitleOverlayImageConfig>
  outputDir: string
}) {
  const itemDir = join(input.outputDir, sanitizePathSegment(String(input.sourceItem.id || basename(input.sourceItem.sourceVideoPath)), randomUUID()))
  await mkdir(itemDir, { recursive: true })

  const selectedTitle = normalizeSelectedTitle(input.titleConfig)
  const remotionVideoPath = join(itemDir, 'remotion-subtitle.mov')
  const outputVideoPath = join(itemDir, `${basename(input.sourceItem.sourceVideoPath).replace(/\.[^.]+$/, '')}_subtitle.mp4`)
  const mediaInfo = await getMediaInfo(input.sourceItem.sourceVideoPath)
  const durationInFrames = Math.max(1, Math.ceil(Math.max(0.2, Number(mediaInfo.durationSec || 1)) * FPS))

  await renderRemotionIntermediateVideo({
    outputPath: remotionVideoPath,
    durationInFrames,
    selectedTitle,
    styleConfig: input.styleConfig,
    overlayConfig: input.overlayConfig,
  })
  await muxRemotionVideoWithSource({
    sourceVideoPath: input.sourceItem.sourceVideoPath,
    remotionVideoPath,
    outputPath: outputVideoPath,
  })

  return {
    itemDir,
    outputVideoPath,
    overlayImagePath: remotionVideoPath,
    selectedTitle,
  }
}
