import { randomUUID } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { availableParallelism, cpus } from 'node:os'
import { basename, join, dirname } from 'node:path'
import { ASS_DEFAULT_FONT_FAMILY, ASS_DEFAULT_FONT_SIZE } from '../../../shared/assDefaults'
import { getAppPaths } from '../../lib/paths'
import { prepareFontsDirForSubtitles, resolveAssFontFamilyForFontsDir, resolveSubtitleRenderFont } from '../../lib/fontResolve'
import { probeMedia } from '../ffmpeg/probe'
import { runFfmpeg } from '../ffmpeg/runner'
import { generateThumbnailJpg } from '../media/thumbnail'
import { cloneRepo } from '../clone/repo'
import { generateChatCompletion } from '../clone/unifiedChat'
import {
  addCapcutCaptions,
  addCapcutVideos,
  createCapcutDraft,
  genCapcutVideo,
  getCapcutVideoStatus,
  isCapcutMateConfigured,
  saveCapcutDraft,
} from './capcutMate'
import {
  generateBatchSubtitlePreviewFrameByRemotion,
} from './batchSubtitleRemotion'
import { renderBatchSubtitleVideoWithBitmapOverlay } from './batchSubtitleBitmap'
import type {
  BatchSubtitleCaptionStyle,
  BatchSubtitleCue,
  BatchSubtitleExportEngine,
  BatchSubtitleJob,
  BatchSubtitleJobStatus,
  BatchSubtitleLayoutPolicy,
  BatchSubtitleMode,
  BatchSubtitleOverlayImageConfig,
  BatchSubtitleOutputItem,
  BatchSubtitlePreviewResult,
  BatchSubtitleSourceEngine,
  BatchSubtitleSourceItem,
  BatchSubtitleStyleConfig,
  BatchSubtitleTitleAnalysisItem,
  BatchSubtitleTitleConfig,
  BatchSubtitleTitleItem,
  BatchSubtitleTitleRenderMode,
  BatchSubtitleTitleStyleMode,
  BatchSubtitleTrack,
  BatchSubtitleViralTitleConfig,
  GeelarkClonePublishCandidate,
} from './types'
import { webPlatformRepo } from './repo'
import { isWhisperCompatibleConfigured, transcribeWithWhisperCompatible } from './whisperCompatible'
import { materializeManagedAsset } from '../managed-assets/service'

const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1920
const NORMALIZE_VIDEO_FILTER =
  'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black'
const MP4_AUDIO_COPY_CODECS = new Set(['aac', 'alac', 'mp3', 'ac3', 'eac3'])
const BATCH_SUBTITLE_PROGRESS_FLUSH_INTERVAL_MS = 1500
const BATCH_SUBTITLE_PAUSE_CHECK_INTERVAL_MS = 1200

function batchSubtitleAssEncodeArgs() {
  return ['-c:v', 'libx264', '-preset', 'superfast', '-crf', '23'] as string[]
}

function now() {
  return Date.now()
}

function safeFsName(input: string, fallback = 'item') {
  const cleaned = String(input || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || fallback
}

function resolveVideoNormalizeFilter(sourceItem: Pick<BatchSubtitleSourceItem, 'width' | 'height'>) {
  const width = Math.max(0, Number(sourceItem.width || 0))
  const height = Math.max(0, Number(sourceItem.height || 0))
  if (width === CANVAS_WIDTH && height === CANVAS_HEIGHT) {
    return 'setsar=1'
  }
  return NORMALIZE_VIDEO_FILTER
}

function toAssColor(hex: string | undefined, fallback: string) {
  const raw = String(hex || '').trim()
  const m = raw.match(/^#?([0-9a-fA-F]{6})$/)?.[1]
  if (!m) return fallback
  const rr = m.slice(0, 2).toUpperCase()
  const gg = m.slice(2, 4).toUpperCase()
  const bb = m.slice(4, 6).toUpperCase()
  return `&H00${bb}${gg}${rr}`
}

function assTime(sec: number) {
  const s = Math.max(0, sec)
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = Math.floor(s % 60)
  const cs = Math.floor((s - Math.floor(s)) * 100)
  return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function escAssText(s: string) {
  return String(s ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\{/g, '｛')
    .replace(/\}/g, '｝')
    .replace(/\n/g, '\\N')
}

function defaultLayoutPolicy(): BatchSubtitleLayoutPolicy {
  return {
    maxLines: 2,
    maxWidthRatio: 0.7,
    reflowStrategy: 'balanced',
    avoidPosition: 'auto',
  }
}

function defaultTitleRenderMode(): BatchSubtitleTitleRenderMode {
  return 'overlay_image'
}

function normalizeTitleStyleMode(mode?: BatchSubtitleTitleStyleMode): BatchSubtitleTitleStyleMode {
  return mode === 'vn_tiktok_viral' ? 'vn_tiktok_viral' : 'default'
}

function normalizeViralTitleConfig(input?: BatchSubtitleViralTitleConfig | null): BatchSubtitleViralTitleConfig | undefined {
  if (!input) return undefined
  const language = input.language === 'en' || input.language === 'zh' ? input.language : 'vi'
  const tone = input.tone === 'conversion' || input.tone === 'emotional' ? input.tone : 'hook'
  const symbolIntensity =
    input.symbolIntensity === 'low' || input.symbolIntensity === 'high' ? input.symbolIntensity : 'medium'
  const sellingPoints = String(input.sellingPoints || '').trim()
  return {
    language,
    tone,
    sellingPoints: sellingPoints || undefined,
    symbolIntensity,
    generationMode: 'video_content',
  }
}

function normalizeTitleAnalysisItems(
  sourceItems: BatchSubtitleSourceItem[],
  input?: BatchSubtitleTitleAnalysisItem[] | null,
): BatchSubtitleTitleAnalysisItem[] {
  if (!Array.isArray(input)) return []
  const sourceIds = new Set(sourceItems.map((item) => item.id))
  return input
    .filter((item) => item && sourceIds.has(String(item.sourceItemId || '').trim()))
    .map((item) => ({
      sourceItemId: String(item.sourceItemId || '').trim(),
      summary: String(item.summary || '').trim(),
      subject: String(item.subject || '').trim() || undefined,
      action: String(item.action || '').trim() || undefined,
      scene: String(item.scene || '').trim() || undefined,
      durationSec: typeof item.durationSec === 'number' ? item.durationSec : undefined,
      updatedAt: Number(item.updatedAt || now()) || now(),
    }))
    .filter((item) => item.sourceItemId && item.summary)
}

export function defaultBatchSubtitleStyle(): BatchSubtitleStyleConfig {
  return {
    fontName: ASS_DEFAULT_FONT_FAMILY,
    fontSize: ASS_DEFAULT_FONT_SIZE,
    fontColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 6,
    shadowColor: '#000000',
    shadowBlur: 12,
    position: 'top',
    safeMargin: 12,
    lineMode: 'multi',
    textAlign: 'center',
    maxLines: 2,
    maxWidthRatio: 0.7,
    lineGap: 8,
    bottomMargin: 220,
  }
}

export function defaultBatchSubtitleTitleConfig(): BatchSubtitleTitleConfig {
  return {
    strategy: 'single_for_all',
    singleText: '',
    titlePool: [],
  }
}

export function defaultBatchSubtitleOverlayImageConfig(): BatchSubtitleOverlayImageConfig {
  const style = defaultBatchSubtitleCaptionStyle()
  return {
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
    fontName: style.fontName,
    fontSize: style.fontSize,
    fontColor: style.fontColor,
    strokeColor: style.strokeColor,
    strokeWidth: style.strokeWidth,
    shadowColor: style.shadowColor,
    shadowBlur: style.shadowBlur,
    position: style.position,
    safeMargin: style.safeMargin,
    textAlign: style.textAlign,
    maxLines: style.maxLines,
    maxWidthRatio: style.maxWidthRatio,
    lineGap: style.lineGap,
    bottomMargin: style.bottomMargin,
  }
}

export function defaultBatchSubtitleCaptionStyle(): BatchSubtitleCaptionStyle {
  const style = defaultBatchSubtitleStyle()
  return {
    fontName: style.fontName,
    fontSize: style.fontSize,
    fontColor: style.fontColor,
    strokeColor: style.strokeColor,
    strokeWidth: style.strokeWidth,
    shadowColor: style.shadowColor,
    shadowBlur: style.shadowBlur,
    position: style.position,
    safeMargin: style.safeMargin,
    textAlign: style.textAlign,
    maxLines: style.maxLines || 2,
    maxWidthRatio: style.maxWidthRatio || 0.7,
    lineGap: style.lineGap || 8,
    bottomMargin: style.bottomMargin || 220,
  }
}

function normalizeStyleConfig(input?: Partial<BatchSubtitleStyleConfig> | null): BatchSubtitleStyleConfig {
  const base = defaultBatchSubtitleStyle()
  return {
    ...base,
    ...(input || {}),
    maxLines: Math.max(1, Math.min(6, Number(input?.maxLines ?? base.maxLines ?? 2))),
    maxWidthRatio: Math.max(0.4, Math.min(0.92, Number(input?.maxWidthRatio ?? base.maxWidthRatio ?? 0.7))),
    lineGap: Math.max(0, Math.min(40, Number(input?.lineGap ?? base.lineGap ?? 8))),
    bottomMargin: Math.max(48, Math.min(600, Number(input?.bottomMargin ?? base.bottomMargin ?? 220))),
  }
}

function normalizeCaptionStyle(input?: Partial<BatchSubtitleCaptionStyle> | null): BatchSubtitleCaptionStyle {
  const base = defaultBatchSubtitleCaptionStyle()
  const merged = {
    ...base,
    ...(input || {}),
  }
  return {
    ...merged,
    maxLines: Math.max(1, Math.min(6, Number(merged.maxLines || base.maxLines))),
    maxWidthRatio: Math.max(0.4, Math.min(0.92, Number(merged.maxWidthRatio || base.maxWidthRatio))),
    lineGap: Math.max(0, Math.min(40, Number(merged.lineGap || base.lineGap))),
    bottomMargin: Math.max(48, Math.min(600, Number(merged.bottomMargin || base.bottomMargin))),
  }
}

function normalizeLayoutPolicy(input?: Partial<BatchSubtitleLayoutPolicy> | null): BatchSubtitleLayoutPolicy {
  const base = defaultLayoutPolicy()
  return {
    maxLines: Math.max(1, Math.min(6, Number(input?.maxLines ?? base.maxLines))),
    maxWidthRatio: Math.max(0.4, Math.min(0.92, Number(input?.maxWidthRatio ?? base.maxWidthRatio))),
    reflowStrategy: input?.reflowStrategy === 'punctuation' ? 'punctuation' : 'balanced',
    avoidPosition: input?.avoidPosition === 'top' || input?.avoidPosition === 'bottom' ? input.avoidPosition : 'auto',
  }
}

function normalizeMode(mode?: BatchSubtitleMode): BatchSubtitleMode {
  return mode === 'static_title' || mode === 'hybrid' ? mode : 'timed_caption'
}

function normalizeSubtitleSource(source?: BatchSubtitleSourceEngine): BatchSubtitleSourceEngine {
  return source === 'manual' ? 'manual' : 'whisper_compatible'
}

function normalizeExportEngine(engine?: BatchSubtitleExportEngine): BatchSubtitleExportEngine {
  return engine === 'ass_fallback' ? 'ass_fallback' : 'capcut_mate'
}

function normalizeTitleRenderMode(mode?: BatchSubtitleTitleRenderMode): BatchSubtitleTitleRenderMode {
  return mode === 'ass_text' ? 'ass_text' : 'overlay_image'
}

function normalizeOverlayImageConfig(
  input?: Partial<BatchSubtitleOverlayImageConfig> | null,
  fallbackStyle?: BatchSubtitleCaptionStyle,
): BatchSubtitleOverlayImageConfig {
  const base = defaultBatchSubtitleOverlayImageConfig()
  const style = fallbackStyle || defaultBatchSubtitleCaptionStyle()
  const merged = {
    ...base,
    ...(input || {}),
  }
  return {
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
    fontName: String(merged.fontName || style.fontName || base.fontName),
    fontSize: Math.max(18, Math.min(160, Number(merged.fontSize || style.fontSize || base.fontSize))),
    fontColor: String(merged.fontColor || style.fontColor || base.fontColor),
    strokeColor: String(merged.strokeColor || style.strokeColor || base.strokeColor),
    strokeWidth: Math.max(0, Math.min(12, Number(merged.strokeWidth || style.strokeWidth || base.strokeWidth))),
    shadowColor: String(merged.shadowColor || style.shadowColor || base.shadowColor),
    shadowBlur: Math.max(0, Math.min(40, Number(merged.shadowBlur || style.shadowBlur || base.shadowBlur))),
    position: merged.position === 'bottom' || merged.position === 'center' ? merged.position : 'top',
    safeMargin: Math.max(0, Math.min(40, Number(merged.safeMargin || style.safeMargin || base.safeMargin))),
    textAlign: merged.textAlign === 'left' || merged.textAlign === 'right' ? merged.textAlign : 'center',
    maxLines: Math.max(1, Math.min(6, Number(merged.maxLines || style.maxLines || base.maxLines))),
    maxWidthRatio: Math.max(0.4, Math.min(0.92, Number(merged.maxWidthRatio || style.maxWidthRatio || base.maxWidthRatio))),
    lineGap: Math.max(0, Math.min(40, Number(merged.lineGap || style.lineGap || base.lineGap))),
    bottomMargin: Math.max(48, Math.min(600, Number(merged.bottomMargin || style.bottomMargin || base.bottomMargin))),
  }
}

type BatchSubtitlePluginConfig = {
  subtitleSource?: BatchSubtitleSourceEngine
  exportEngine?: BatchSubtitleExportEngine
  whisperBaseUrl?: string
  whisperApiKey?: string
  whisperModel?: string
  capcutMateBaseUrl?: string
  capcutDraftRoot?: string
  capcutExportMode?: 'draft_and_video' | 'draft_only'
  requestTimeoutMs?: number
  burnIn?: boolean
}

function normalizePluginConfig(input?: BatchSubtitlePluginConfig | null) {
  return {
    subtitleSource: normalizeSubtitleSource(input?.subtitleSource),
    exportEngine: normalizeExportEngine(input?.exportEngine),
    whisperBaseUrl: String(input?.whisperBaseUrl || '').trim(),
    whisperApiKey: String(input?.whisperApiKey || '').trim() || undefined,
    whisperModel: String(input?.whisperModel || '').trim() || 'whisper-1',
    capcutMateBaseUrl: String(input?.capcutMateBaseUrl || '').trim(),
    capcutDraftRoot: String(input?.capcutDraftRoot || '').trim() || undefined,
    capcutExportMode: input?.capcutExportMode === 'draft_only' ? 'draft_only' : 'draft_and_video',
    requestTimeoutMs: Math.max(5_000, Number(input?.requestTimeoutMs || 120_000)),
    burnIn: Boolean(input?.burnIn),
  }
}

function normalizeCueLines(text: string, maxLines: number) {
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return lines.length ? lines.slice(0, Math.max(1, maxLines)) : [String(text || '').trim()]
}

function splitTextTokens(text: string) {
  const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!raw) return []
  const tokens = raw.match(/[\u4e00-\u9fff]|[^\s\u4e00-\u9fff]+|\s+/gu)
  return tokens && tokens.length ? tokens : Array.from(raw)
}

function measureTextWidth(text: string, fontPath: string | null, fontSize: number) {
  if (!text) return 0
  if (!fontPath) return Math.round(text.length * fontSize)
  try {
    const fontkit = require('fontkit') as { openSync: (path: string) => any }
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

function wrapCueText(text: string, style: BatchSubtitleCaptionStyle, fontPath: string | null) {
  const maxWidth = CANVAS_WIDTH * style.maxWidthRatio - style.safeMargin * 2
  const tokens = splitTextTokens(text)
  if (!tokens.length) return ['']
  const lines: string[] = []
  let current = ''
  for (const token of tokens) {
    const next = current + token
    const width = measureTextWidth(next, fontPath, style.fontSize)
    if (current && width > maxWidth) {
      lines.push(current.trim())
      current = token.trimStart()
      continue
    }
    current = next
  }
  if (current.trim()) lines.push(current.trim())
  return lines.length ? lines.slice(0, Math.max(1, style.maxLines)) : [String(text || '').trim()]
}

function splitCueByLines(cue: BatchSubtitleCue, style: BatchSubtitleCaptionStyle, fontPath: string | null): BatchSubtitleCue[] {
  const lines = wrapCueText(cue.text, style, fontPath)
  const maxLines = Math.max(1, style.maxLines)
  if (lines.length <= maxLines) {
    return [{ ...cue, lines }]
  }
  const out: BatchSubtitleCue[] = []
  const totalDuration = Math.max(120, cue.endMs - cue.startMs)
  const groups: string[][] = []
  for (let i = 0; i < lines.length; i += maxLines) groups.push(lines.slice(i, i + maxLines))
  const charWeights = groups.map((items) => Math.max(1, items.join('').length))
  const weightSum = charWeights.reduce((sum, item) => sum + item, 0)
  let currentStart = cue.startMs
  groups.forEach((items, idx) => {
    const span = idx === groups.length - 1 ? cue.endMs - currentStart : Math.max(120, Math.round((totalDuration * charWeights[idx]) / weightSum))
    const currentEnd = Math.min(cue.endMs, currentStart + span)
    out.push({
      ...cue,
      id: `${cue.id}-${idx + 1}`,
      startMs: currentStart,
      endMs: Math.max(currentStart + 120, currentEnd),
      lines: items,
      text: items.join('\n'),
    })
    currentStart = Math.max(currentStart + 120, currentEnd)
  })
  return out
}

function normalizeCue(cue: Partial<BatchSubtitleCue>, style: BatchSubtitleCaptionStyle, fontPath: string | null): BatchSubtitleCue {
  const text = String(cue.text || '').trim()
  return {
    id: String(cue.id || randomUUID()),
    startMs: Math.max(0, Math.round(Number(cue.startMs ?? 0))),
    endMs: Math.max(0, Math.round(Number(cue.endMs ?? 0))),
    text,
    lines: Array.isArray(cue.lines) && cue.lines.length ? cue.lines.map((line) => String(line || '').trim()).filter(Boolean) : wrapCueText(text, style, fontPath),
  }
}

function normalizeTrack(track: Partial<BatchSubtitleTrack> | undefined, sourceItemId: string, style: BatchSubtitleCaptionStyle, fontPath: string | null): BatchSubtitleTrack {
  const cues = Array.isArray(track?.cues)
    ? track!.cues.flatMap((cue) => splitCueByLines(normalizeCue(cue, style, fontPath), style, fontPath))
    : []
  return {
    sourceItemId,
    status: track?.status === 'processing' || track?.status === 'completed' || track?.status === 'failed' ? track.status : cues.length ? 'completed' : 'idle',
    language: typeof track?.language === 'string' ? track.language : undefined,
    cues,
    error: typeof track?.error === 'string' ? track.error : undefined,
    updatedAt: Number(track?.updatedAt || now()),
  }
}

function chooseSourceItemId(job: BatchSubtitleJob, sourceItemId?: string) {
  if (sourceItemId && job.sourceItems.some((item) => item.id === sourceItemId)) return sourceItemId
  return job.sourceItems[0]?.id || ''
}

function getTrackForSource(job: BatchSubtitleJob, sourceItemId: string) {
  return job.subtitleTracks.find((item) => item.sourceItemId === sourceItemId) || null
}

function normalizeTitleItems(
  sourceItems: BatchSubtitleSourceItem[],
  titleConfig: BatchSubtitleTitleConfig,
  input?: BatchSubtitleTitleItem[] | null,
): BatchSubtitleTitleItem[] {
  const items = Array.isArray(input) ? input : []
  return sourceItems.map((sourceItem, index) => {
    const matched = items.find((item) => item.sourceItemId === sourceItem.id)
    return {
      sourceItemId: sourceItem.id,
      text: String(matched?.text || titleForIndex(titleConfig, index) || '').trim(),
      updatedAt: Number(matched?.updatedAt || now()),
    }
  })
}

function getTitleForSource(job: BatchSubtitleJob, sourceItemId: string, fallbackIndex = 0) {
  const matched = job.titleItems?.find((item) => item.sourceItemId === sourceItemId)
  const text = String(matched?.text || '').trim()
  if (text) return text
  return titleForIndex(job.titleConfig, fallbackIndex)
}

function upsertTrack(job: BatchSubtitleJob, nextTrack: BatchSubtitleTrack) {
  const tracks = job.subtitleTracks.filter((item) => item.sourceItemId !== nextTrack.sourceItemId)
  tracks.unshift(nextTrack)
  return {
    ...job,
    subtitleTracks: tracks,
    updatedAt: now(),
  }
}

function sourceDurationMs(sourceItem: BatchSubtitleSourceItem) {
  const dur = Number(sourceItem.durationSec || 0)
  return Math.max(2000, Math.round(dur * 1000))
}

function normalizeEventText(text: string) {
  return escAssText(String(text || '').replace(/\n+/g, '\n').trim())
}

function styleLine(
  name: string,
  config: BatchSubtitleCaptionStyle,
  fontFamily: string,
  alignment: number,
  marginV: number,
) {
  return `Style: ${name},${fontFamily},${Math.max(18, Math.min(120, Math.round(config.fontSize)))},${toAssColor(config.fontColor, '&H00FFFFFF')},${toAssColor(config.fontColor, '&H00FFFFFF')},${toAssColor(config.strokeColor, '&H00332B2A')},${toAssColor(config.shadowColor, '&H00000000')},1,1,0,0,100,100,0,0,1,${Math.max(0, Math.min(12, Math.round(config.strokeWidth)))},0,${alignment},20,20,${Math.max(0, Math.min(900, Math.round(marginV)))},1`
}

function assAlignment(position: BatchSubtitleCaptionStyle['position']) {
  if (position === 'center') return 5
  if (position === 'bottom') return 2
  return 8
}

function assMarginV(position: BatchSubtitleCaptionStyle['position'], style: BatchSubtitleCaptionStyle) {
  if (position === 'center') return 0
  if (position === 'bottom') return style.bottomMargin
  return Math.max(48, Math.min(560, 180 + Math.round(style.safeMargin * 12)))
}

function buildAssForBatchSubtitle(input: {
  job: BatchSubtitleJob
  sourceItem: BatchSubtitleSourceItem
  selectedTitle: string
  track?: BatchSubtitleTrack | null
  previewAtSec?: number
  assFontFamily?: string
}) {
  const mode = normalizeMode(input.job.subtitleMode)
  const style = normalizeCaptionStyle(input.job.captionStyle)
  const resolved = resolveSubtitleRenderFont(style.fontName)
  const fontFamily = String(input.assFontFamily || resolved.family || style.fontName || ASS_DEFAULT_FONT_FAMILY).trim()
  const titlePosition = style.position
  const captionPosition =
    mode === 'hybrid' && titlePosition === 'top' ? 'bottom' : style.position
  const titleAlignment = assAlignment(titlePosition)
  const captionAlignment = assAlignment(captionPosition)
  const titleMargin = assMarginV(titlePosition, style)
  const captionMargin = assMarginV(captionPosition, { ...style, position: captionPosition })
  const hasStaticTitle = mode === 'static_title' || mode === 'hybrid'
  const hasTimed = mode === 'timed_caption' || mode === 'hybrid'
  const titleText = String(input.selectedTitle || '').trim()
  const cues = hasTimed ? input.track?.cues || [] : []
  const durSec = Math.max(1.5, Number(input.sourceItem.durationSec || 0) || 2)
  const lines: string[] = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'Collisions: Normal',
    `PlayResX: ${CANVAS_WIDTH}`,
    `PlayResY: ${CANVAS_HEIGHT}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
    styleLine('BatchTitle', style, fontFamily, titleAlignment, titleMargin),
    styleLine('BatchCaption', { ...style, fontSize: Math.max(16, Math.round(style.fontSize * 0.9)) }, fontFamily, captionAlignment, captionMargin),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ]
  if (hasStaticTitle && titleText) {
    lines.push(`Dialogue: 0,${assTime(0)},${assTime(durSec)},BatchTitle,,0,0,0,,${normalizeEventText(titleText)}`)
  }
  if (hasTimed) {
    const cueList = cues.length ? cues : input.track?.cues || []
    for (const cue of cueList) {
      const start = Math.max(0, Number(cue.startMs || 0) / 1000)
      const end = Math.max(start + 0.12, Number(cue.endMs || 0) / 1000)
      const body = cue.lines && cue.lines.length ? cue.lines.join('\n') : cue.text
      lines.push(`Dialogue: 0,${assTime(start)},${assTime(end)},BatchCaption,,0,0,0,,${normalizeEventText(body)}`)
    }
  }
  return lines.join('\n') + '\n'
}

async function writeAssFile(input: {
  job: BatchSubtitleJob
  sourceItem: BatchSubtitleSourceItem
  selectedTitle: string
  track?: BatchSubtitleTrack | null
  workDir: string
  previewAtSec?: number
  assFontFamily?: string
  fontsDir?: string
}) {
  const fontsDir = input.fontsDir || (await prepareFontsDirForSubtitles(input.workDir))
  const requestedFont = String(input.job.captionStyle.fontName || defaultBatchSubtitleCaptionStyle().fontName || ASS_DEFAULT_FONT_FAMILY)
  const assFontFamily = input.assFontFamily || (await resolveAssFontFamilyForFontsDir(fontsDir, requestedFont))
  const assPath = join(input.workDir, `${basename(input.sourceItem.sourceVideoPath).replace(/\.[^.]+$/, '')}.ass`)
  await writeFile(
    assPath,
    buildAssForBatchSubtitle({
      job: input.job,
      sourceItem: input.sourceItem,
      selectedTitle: input.selectedTitle,
      track: input.track,
      previewAtSec: input.previewAtSec,
      assFontFamily,
    }),
    'utf8',
  )
  return {
    assPath,
    assFontFamily,
    fontsDir,
  }
}

async function renderAssVideo(input: {
  sourceItem: Pick<BatchSubtitleSourceItem, 'width' | 'height'>
  sourceVideoPath: string
  assPath: string
  outputPath: string
  fontsDir: string
  previewAtSec?: number
  clipSec?: number
  ffmpegThreads?: number
}) {
  const assArg = input.assPath.replace(/\\/g, '/').replace(/:/g, '\\:')
  const fontsArg = input.fontsDir.replace(/\\/g, '/').replace(/:/g, '\\:')
  const normalizeVideoFilter = resolveVideoNormalizeFilter(input.sourceItem)
  const audioArgs = await resolveSubtitleAudioArgs(input.sourceVideoPath)
  const args = [
    '-y',
    ...(typeof input.previewAtSec === 'number' ? ['-ss', `${input.previewAtSec}`] : []),
    ...(typeof input.clipSec === 'number' ? ['-t', `${input.clipSec}`] : []),
    '-i',
    input.sourceVideoPath,
    '-filter_complex',
    `[0:v]${normalizeVideoFilter},subtitles='${assArg}':fontsdir='${fontsArg}'[outv]`,
    '-map',
    '[outv]',
    ...audioArgs,
    '-threads',
    `${Math.max(1, Math.floor(Number(input.ffmpegThreads || 1)))}`,
    ...batchSubtitleAssEncodeArgs(),
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    input.outputPath,
  ]
  await runFfmpeg({ args })
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

export async function enrichBatchSubtitleSourceItem(
  input: Omit<BatchSubtitleSourceItem, 'fileName' | 'coverImagePath' | 'durationSec' | 'width' | 'height'> &
    Partial<Pick<BatchSubtitleSourceItem, 'fileName' | 'coverImagePath' | 'durationSec' | 'width' | 'height'>>,
): Promise<BatchSubtitleSourceItem> {
  const probe = await probeMedia(input.sourceVideoPath)
  const fallbackCoverImagePath =
    String(input.coverImagePath || '').trim() ||
    ((await generateThumbnailJpg({ filePath: input.sourceVideoPath, atSec: probe.durationSec >= 1 ? 1 : 0.5 })) || undefined)
  return {
    ...input,
    fileName: input.fileName || basename(input.sourceVideoPath),
    coverImagePath: fallbackCoverImagePath,
    durationSec: input.durationSec ?? probe.durationSec,
    width: input.width ?? probe.width,
    height: input.height ?? probe.height,
  }
}

async function materializeBatchSubtitleSourceItem(item: BatchSubtitleSourceItem, ownerId: string) {
  const sourceVideoPath = await materializeManagedAsset({
    sourcePath: item.sourceVideoPath,
    module: 'subtitle',
    ownerId,
    assetId: `${item.id}-video`,
  })
  const coverImagePath = await materializeManagedAsset({
    sourcePath: item.coverImagePath,
    module: 'subtitle',
    ownerId,
    assetId: `${item.id}-cover`,
  })
  return {
    ...item,
    sourceVideoPath,
    coverImagePath,
  }
}

export function normalizeBatchSubtitleJob(input: BatchSubtitleJob): BatchSubtitleJob {
  const style = normalizeStyleConfig(input.styleConfig)
  const captionStyle = normalizeCaptionStyle((input as any).captionStyle || input.styleConfig)
  const layoutPolicy = normalizeLayoutPolicy((input as any).layoutPolicy)
  const mode = normalizeMode((input as any).subtitleMode)
  const titleConfig = {
    ...defaultBatchSubtitleTitleConfig(),
    ...((input as any).titleConfig || {}),
  }
  const tracks = Array.isArray((input as any).subtitleTracks) ? (input as any).subtitleTracks : []
  const fontPath = resolveSubtitleRenderFont(captionStyle.fontName).path
  const subtitleTracks = input.sourceItems.map((sourceItem) => {
    const track = tracks.find((item: BatchSubtitleTrack) => item.sourceItemId === sourceItem.id) || null
    return normalizeTrack(track, sourceItem.id, captionStyle, fontPath)
  })
  return {
    ...input,
    subtitleMode: mode,
    subtitleSource: normalizeSubtitleSource((input as any).subtitleSource),
    exportEngine: normalizeExportEngine((input as any).exportEngine),
    titleRenderMode: normalizeTitleRenderMode((input as any).titleRenderMode),
    titleConfig,
    titleItems: normalizeTitleItems(input.sourceItems, titleConfig, (input as any).titleItems),
    titleStyleMode: normalizeTitleStyleMode((input as any).titleStyleMode),
    viralTitleConfig: normalizeViralTitleConfig((input as any).viralTitleConfig),
    titleAnalysisItems: normalizeTitleAnalysisItems(input.sourceItems, (input as any).titleAnalysisItems),
    overlayImageConfig: normalizeOverlayImageConfig((input as any).overlayImageConfig, captionStyle),
    styleConfig: style,
    captionStyle,
    layoutPolicy,
    subtitleTracks,
    capcutDraft: input.capcutDraft
      ? {
          draftId: String(input.capcutDraft.draftId || '').trim() || undefined,
          status: String(input.capcutDraft.status || '').trim() || undefined,
          error: String(input.capcutDraft.error || '').trim() || undefined,
          taskId: String(input.capcutDraft.taskId || '').trim() || undefined,
          exportPath: String(input.capcutDraft.exportPath || '').trim() || undefined,
          updatedAt: Number(input.capcutDraft.updatedAt || 0) || undefined,
        }
      : undefined,
    batchRuntime: input.batchRuntime
      ? {
          batchSize: Number(input.batchRuntime.batchSize || 0) || undefined,
          nextSourceIndex: Math.max(0, Number(input.batchRuntime.nextSourceIndex || 0)),
          totalBatches: Number(input.batchRuntime.totalBatches || 0) || undefined,
          completedBatches: Math.max(0, Number(input.batchRuntime.completedBatches || 0)),
          lastBatchStartedAt: Number(input.batchRuntime.lastBatchStartedAt || 0) || undefined,
          lastBatchFinishedAt: Number(input.batchRuntime.lastBatchFinishedAt || 0) || undefined,
        }
      : undefined,
  }
}

export async function createBatchSubtitleJob(input: {
  userId: string
  name: string
  sourceItems: BatchSubtitleSourceItem[]
  subtitleMode?: BatchSubtitleMode
  subtitleSource?: BatchSubtitleSourceEngine
  exportEngine?: BatchSubtitleExportEngine
  titleRenderMode?: BatchSubtitleTitleRenderMode
  titleConfig?: Partial<BatchSubtitleTitleConfig>
  titleItems?: BatchSubtitleTitleItem[]
  titleStyleMode?: BatchSubtitleTitleStyleMode
  viralTitleConfig?: BatchSubtitleViralTitleConfig
  titleAnalysisItems?: BatchSubtitleTitleAnalysisItem[]
  overlayImageConfig?: Partial<BatchSubtitleOverlayImageConfig>
  styleConfig?: Partial<BatchSubtitleStyleConfig>
  captionStyle?: Partial<BatchSubtitleCaptionStyle>
  layoutPolicy?: Partial<BatchSubtitleLayoutPolicy>
}) {
  const titleConfig = {
    ...defaultBatchSubtitleTitleConfig(),
    ...(input.titleConfig || {}),
  }
  const captionStyle = normalizeCaptionStyle(input.captionStyle)
  const jobId = randomUUID()
  const sourceItems = await Promise.all(
    input.sourceItems.map((item) => materializeBatchSubtitleSourceItem(item, jobId)),
  )
  const job: BatchSubtitleJob = {
    id: jobId,
    userId: input.userId,
    name: String(input.name || '').trim() || `批量字幕任务 ${new Date().toLocaleString('zh-CN')}`,
    sourceItems,
    subtitleMode: normalizeMode(input.subtitleMode),
    subtitleSource: normalizeSubtitleSource(input.subtitleSource),
    exportEngine: normalizeExportEngine(input.exportEngine),
    titleRenderMode: normalizeTitleRenderMode(input.titleRenderMode),
    titleConfig,
    titleItems: normalizeTitleItems(sourceItems, titleConfig, input.titleItems),
    titleStyleMode: normalizeTitleStyleMode(input.titleStyleMode),
    viralTitleConfig: normalizeViralTitleConfig(input.viralTitleConfig),
    titleAnalysisItems: normalizeTitleAnalysisItems(sourceItems, input.titleAnalysisItems),
    overlayImageConfig: normalizeOverlayImageConfig(input.overlayImageConfig, captionStyle),
    styleConfig: normalizeStyleConfig(input.styleConfig),
    captionStyle,
    layoutPolicy: normalizeLayoutPolicy(input.layoutPolicy),
    subtitleTracks: [],
    status: 'draft',
    progress: 0,
    outputCount: 0,
    outputs: [],
    capcutDraft: undefined,
    batchRuntime: undefined,
    createdAt: now(),
    updatedAt: now(),
  }
  return await webPlatformRepo.upsertBatchSubtitleJob(job)
}

export async function updateBatchSubtitleDraft(input: {
  userId: string
  jobId: string
  patch: Partial<Pick<BatchSubtitleJob, 'name' | 'sourceItems' | 'titleConfig' | 'styleConfig' | 'subtitleMode'>> & {
    subtitleSource?: BatchSubtitleSourceEngine
    exportEngine?: BatchSubtitleExportEngine
    titleRenderMode?: BatchSubtitleTitleRenderMode
    titleItems?: BatchSubtitleTitleItem[]
    titleStyleMode?: BatchSubtitleTitleStyleMode
    viralTitleConfig?: BatchSubtitleViralTitleConfig
    titleAnalysisItems?: BatchSubtitleTitleAnalysisItem[]
    overlayImageConfig?: Partial<BatchSubtitleOverlayImageConfig>
    captionStyle?: Partial<BatchSubtitleCaptionStyle>
    layoutPolicy?: Partial<BatchSubtitleLayoutPolicy>
    subtitleTracks?: BatchSubtitleTrack[]
    capcutDraft?: BatchSubtitleJob['capcutDraft']
  }
}) {
  const currentRaw = await webPlatformRepo.getBatchSubtitleJob(input.userId, input.jobId)
  if (!currentRaw) throw new Error('批量字幕任务不存在')
  const current = normalizeBatchSubtitleJob(currentRaw)
  const nextCaptionStyle = normalizeCaptionStyle({ ...current.captionStyle, ...(input.patch.captionStyle || {}) })
  const fontPath = resolveSubtitleRenderFont(nextCaptionStyle.fontName).path
  const nextSourceItems = input.patch.sourceItems
    ? await Promise.all(
        input.patch.sourceItems.map(async (item) => {
          return await enrichBatchSubtitleSourceItem({
            id: String(item.id || randomUUID()),
            sourceType: item.sourceType,
            sourceVideoPath: String(item.sourceVideoPath || '').trim(),
            sourceProjectId: typeof item.sourceProjectId === 'string' ? item.sourceProjectId : undefined,
            sourceProjectTitle: typeof item.sourceProjectTitle === 'string' ? item.sourceProjectTitle : undefined,
            fileName: typeof item.fileName === 'string' ? item.fileName : undefined,
            coverImagePath: typeof item.coverImagePath === 'string' ? item.coverImagePath : undefined,
            durationSec: typeof item.durationSec === 'number' ? item.durationSec : undefined,
            width: typeof item.width === 'number' ? item.width : undefined,
            height: typeof item.height === 'number' ? item.height : undefined,
          })
        }),
      )
    : current.sourceItems
  const materializedSourceItems = input.patch.sourceItems
    ? await Promise.all(nextSourceItems.map((item) => materializeBatchSubtitleSourceItem(item, input.jobId)))
    : nextSourceItems
  const currentSourceSignature = JSON.stringify(
    current.sourceItems.map((item) => [item.id, item.sourceVideoPath, item.sourceType, item.sourceProjectId || '']),
  )
  const nextSourceSignature = JSON.stringify(
    materializedSourceItems.map((item) => [item.id, item.sourceVideoPath, item.sourceType, item.sourceProjectId || '']),
  )
  const sourceItemsChanged = currentSourceSignature !== nextSourceSignature
  const nextTitleConfig = {
    ...current.titleConfig,
    ...(input.patch.titleConfig || {}),
  }
  const nextSubtitleTracks = Array.isArray(input.patch.subtitleTracks)
    ? input.patch.subtitleTracks.map((track) => normalizeTrack(track, track.sourceItemId, nextCaptionStyle, fontPath))
    : sourceItemsChanged
      ? current.subtitleTracks.filter((track) => nextSourceItems.some((item) => item.id === track.sourceItemId))
      : current.subtitleTracks
  const next: BatchSubtitleJob = {
    ...current,
    ...('name' in input.patch ? { name: String(input.patch.name || current.name).trim() || current.name } : {}),
    sourceItems: materializedSourceItems,
    subtitleMode: input.patch.subtitleMode ? normalizeMode(input.patch.subtitleMode) : current.subtitleMode,
    subtitleSource: input.patch.subtitleSource ? normalizeSubtitleSource(input.patch.subtitleSource) : current.subtitleSource,
    exportEngine: input.patch.exportEngine ? normalizeExportEngine(input.patch.exportEngine) : current.exportEngine,
    titleRenderMode: input.patch.titleRenderMode ? normalizeTitleRenderMode(input.patch.titleRenderMode) : current.titleRenderMode,
    titleConfig: nextTitleConfig,
    titleItems: normalizeTitleItems(
      nextSourceItems,
      nextTitleConfig,
      Array.isArray(input.patch.titleItems) ? input.patch.titleItems : current.titleItems,
    ),
    titleStyleMode:
      'titleStyleMode' in input.patch ? normalizeTitleStyleMode(input.patch.titleStyleMode) : current.titleStyleMode,
    viralTitleConfig:
      'viralTitleConfig' in input.patch
        ? normalizeViralTitleConfig(input.patch.viralTitleConfig)
        : current.viralTitleConfig,
    titleAnalysisItems:
      'titleAnalysisItems' in input.patch
        ? normalizeTitleAnalysisItems(nextSourceItems, input.patch.titleAnalysisItems)
        : normalizeTitleAnalysisItems(nextSourceItems, current.titleAnalysisItems),
    overlayImageConfig: normalizeOverlayImageConfig(
      { ...(current.overlayImageConfig || {}), ...(input.patch.overlayImageConfig || {}) },
      nextCaptionStyle,
    ),
    styleConfig: normalizeStyleConfig({ ...current.styleConfig, ...(input.patch.styleConfig || {}) }),
    captionStyle: nextCaptionStyle,
    layoutPolicy: normalizeLayoutPolicy({ ...current.layoutPolicy, ...(input.patch.layoutPolicy || {}) }),
    subtitleTracks: nextSubtitleTracks,
    capcutDraft: input.patch.capcutDraft ? { ...(current.capcutDraft || {}), ...input.patch.capcutDraft } : current.capcutDraft,
    status: sourceItemsChanged ? 'draft' : current.status,
    progress: sourceItemsChanged ? 0 : current.progress,
    outputCount: sourceItemsChanged ? 0 : current.outputCount,
    outputs: sourceItemsChanged ? [] : current.outputs,
    batchRuntime: sourceItemsChanged ? undefined : current.batchRuntime,
    error: sourceItemsChanged ? undefined : current.error,
    updatedAt: now(),
  }
  return await webPlatformRepo.upsertBatchSubtitleJob(next)
}

function titleForIndex(config: BatchSubtitleTitleConfig, index: number) {
  if (config.strategy === 'random_pool') {
    const pool = (config.titlePool || []).map((item) => String(item || '').trim()).filter(Boolean)
    if (!pool.length) return ''
    return pool[Math.floor(Math.random() * pool.length)] || pool[index % pool.length] || pool[0]
  }
  return String(config.singleText || '').trim()
}

function symbolStyleInstruction(level?: BatchSubtitleViralTitleConfig['symbolIntensity']) {
  if (level === 'low') return 'Use little or no decorative symbols.'
  if (level === 'high') return 'Use strong but readable TikTok symbols such as !!!, ??, ✨, 🔥, 😱 when helpful.'
  return 'Use moderate, readable TikTok-style symbols.'
}

function toneInstruction(tone?: BatchSubtitleViralTitleConfig['tone']) {
  if (tone === 'conversion') return 'Prioritize conversion, urgency, savings, and buy-now framing.'
  if (tone === 'emotional') return 'Prioritize emotion, surprise, and curiosity framing.'
  return 'Prioritize strong hooks, scroll-stopping phrasing, and instant curiosity.'
}

function languageInstruction(language?: BatchSubtitleViralTitleConfig['language']) {
  if (language === 'en') return 'Output language: English.'
  if (language === 'zh') return 'Output language: Simplified Chinese.'
  return 'Output language: Vietnamese.'
}

function buildViralTitleAnalysisSummary(sourceItem: BatchSubtitleSourceItem) {
  const fileHint = String(sourceItem.fileName || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
  const duration = typeof sourceItem.durationSec === 'number' ? Math.round(sourceItem.durationSec) : undefined
  const orientation =
    sourceItem.width && sourceItem.height
      ? sourceItem.height > sourceItem.width
        ? 'vertical mobile short video'
        : 'horizontal video'
      : 'short video'
  const summary = [fileHint ? `Filename hint: ${fileHint}.` : '', duration ? `Duration: ${duration}s.` : '', `Format: ${orientation}.`]
    .filter(Boolean)
    .join(' ')
  return {
    sourceItemId: sourceItem.id,
    summary: summary || 'Short video with product or human-focused content.',
    subject: fileHint || undefined,
    action: duration && duration <= 8 ? 'quick visual hook' : 'product or scene presentation',
    scene: orientation,
    durationSec: sourceItem.durationSec,
    updatedAt: now(),
  } satisfies BatchSubtitleTitleAnalysisItem
}

function buildViralTitlePrompt(input: {
  analysis: BatchSubtitleTitleAnalysisItem
  config?: BatchSubtitleViralTitleConfig
}) {
  const config = normalizeViralTitleConfig(input.config)
  const sellingPoints = String(config?.sellingPoints || '').trim()
  return [
    'You are a Vietnam TikTok short-video title writer.',
    languageInstruction(config?.language),
    'Generate exactly 1 short static title for a vertical short video.',
    'The title must feel like a Vietnam TikTok viral hook, not a normal subtitle sentence.',
    toneInstruction(config?.tone),
    symbolStyleInstruction(config?.symbolIntensity),
    'Keep it short, punchy, emotional, readable, and suitable for a large top or bottom overlay.',
    'Prefer strong hook words, benefit points, and stopping-power phrasing.',
    'Avoid generic filler, hashtags, numbering, explanations, or multiple lines.',
    sellingPoints ? `Extra selling points: ${sellingPoints}.` : '',
    input.analysis.subject ? `Possible subject: ${input.analysis.subject}.` : '',
    input.analysis.action ? `Possible action: ${input.analysis.action}.` : '',
    input.analysis.scene ? `Scene hint: ${input.analysis.scene}.` : '',
    `Video summary: ${input.analysis.summary}`,
    'Return only the final title text.',
  ]
    .filter(Boolean)
    .join('\n')
}

function cleanGeneratedTitle(text: string) {
  return String(text || '')
    .replace(/\r?\n+/g, ' ')
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
    .replace(/^[\-\d.\s]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

async function getBatchSubtitlePluginConfig(userId: string) {
  const plugin = await webPlatformRepo.ensurePluginRecord(userId, 'video-batch-subtitle')
  return normalizePluginConfig((plugin.config || {}) as BatchSubtitlePluginConfig)
}

function toCapcutColor(hex: string | undefined, fallback = '#FFFFFF') {
  const raw = String(hex || '').trim()
  return /^#?[0-9a-fA-F]{6}$/.test(raw) ? (raw.startsWith('#') ? raw : `#${raw}`) : fallback
}

function toCapcutPosition(style: BatchSubtitleCaptionStyle) {
  if (style.position === 'top') return 'top'
  if (style.position === 'center') return 'center'
  return 'bottom'
}

async function waitForCapcutVideo(config: ReturnType<typeof normalizePluginConfig>, taskId: string) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < Math.max(30_000, config.requestTimeoutMs)) {
    const status = await getCapcutVideoStatus(
      {
        baseUrl: config.capcutMateBaseUrl,
        requestTimeoutMs: config.requestTimeoutMs,
        draftRoot: config.capcutDraftRoot,
      },
      { taskId },
    )
    const state = String(status.status || '').trim().toLowerCase()
    if (state === 'success' || state === 'completed' || state === 'done') return status
    if (state === 'failed' || state === 'error') {
      throw new Error(String(status.error || status.message || 'capcut-mate 导出失败'))
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  throw new Error('capcut-mate 导出超时')
}

async function renderSingleOutputByCapcut(input: {
  job: BatchSubtitleJob
  sourceItem: BatchSubtitleSourceItem
  outputDir: string
  config: ReturnType<typeof normalizePluginConfig>
}) {
  const { job, sourceItem, outputDir, config } = input
  const track = getTrackForSource(job, sourceItem.id)
  if (!track?.cues?.length) throw new Error('当前素材缺少字幕轨')
  const itemDir = join(outputDir, safeFsName(String(sourceItem.id || randomUUID())))
  await mkdir(itemDir, { recursive: true })
  const draft = await createCapcutDraft(
    {
      baseUrl: config.capcutMateBaseUrl,
      requestTimeoutMs: config.requestTimeoutMs,
      draftRoot: config.capcutDraftRoot,
    },
    {
      projectName: `${job.name}-${sourceItem.fileName || sourceItem.id}`,
      width: sourceItem.width || CANVAS_WIDTH,
      height: sourceItem.height || CANVAS_HEIGHT,
    },
  )
  const draftUrl = String(draft.draft_url || draft.draftId || draft.id || '').trim()
  if (!draftUrl) throw new Error('capcut-mate 未返回草稿地址')
  await addCapcutVideos(
    {
      baseUrl: config.capcutMateBaseUrl,
      requestTimeoutMs: config.requestTimeoutMs,
      draftRoot: config.capcutDraftRoot,
    },
    {
      draftUrl,
      videoPaths: [sourceItem.sourceVideoPath],
    },
  )
  await addCapcutCaptions(
    {
      baseUrl: config.capcutMateBaseUrl,
      requestTimeoutMs: config.requestTimeoutMs,
      draftRoot: config.capcutDraftRoot,
    },
    {
      draftUrl,
      captions: track.cues.map((cue) => ({
        text: cue.text,
        start: cue.startMs * 1000,
        end: cue.endMs * 1000,
        font_size: job.captionStyle.fontSize,
        font_color: toCapcutColor(job.captionStyle.fontColor),
        position: toCapcutPosition(job.captionStyle),
      })),
    },
  )
  await saveCapcutDraft(
    {
      baseUrl: config.capcutMateBaseUrl,
      requestTimeoutMs: config.requestTimeoutMs,
      draftRoot: config.capcutDraftRoot,
    },
    { draftUrl },
  )
  let outputVideoPath = ''
  let taskId = ''
  if (config.capcutExportMode !== 'draft_only') {
    const exportPath = join(itemDir, `${basename(sourceItem.sourceVideoPath).replace(/\.[^.]+$/, '')}_capcut.mp4`)
    const result = await genCapcutVideo(
      {
        baseUrl: config.capcutMateBaseUrl,
        requestTimeoutMs: config.requestTimeoutMs,
        draftRoot: config.capcutDraftRoot,
      },
      {
        draftUrl,
        exportPath,
        width: sourceItem.width || CANVAS_WIDTH,
        height: sourceItem.height || CANVAS_HEIGHT,
      },
    )
    taskId = String(result.task_id || result.taskId || result.id || '').trim()
    if (!taskId) throw new Error('capcut-mate 未返回导出任务 ID')
    const status = await waitForCapcutVideo(config, taskId)
    outputVideoPath = String(status.video_path || status.output || exportPath).trim()
  }
  const coverImagePath =
    outputVideoPath && (await stat(outputVideoPath).then(() => true).catch(() => false))
      ? (await generateThumbnailJpg({ filePath: outputVideoPath, atSec: 1 })) || undefined
      : undefined
  return {
    output: {
      id: randomUUID(),
      jobId: job.id,
      sourceItemId: sourceItem.id,
      sourceVideoPath: sourceItem.sourceVideoPath,
      outputVideoPath: outputVideoPath || undefined,
      coverImagePath,
      selectedTitle: titleForIndex(job.titleConfig, 0),
      renderStatus: 'success' as const,
      publishReady: Boolean(outputVideoPath),
      publishStatus: 'idle' as const,
      sourcePreserved: true as const,
      createdAt: now(),
      updatedAt: now(),
    },
    capcutDraft: {
      draftId: draftUrl,
      taskId: taskId || undefined,
      exportPath: outputVideoPath || undefined,
      status: outputVideoPath ? 'completed' : 'draft_saved',
      updatedAt: now(),
    },
  }
}

async function transcribeBatchSubtitleJobInternal(input: {
  userId: string
  job: BatchSubtitleJob
  sourceItemId?: string
}) {
  const config = await getBatchSubtitlePluginConfig(input.userId)
  if (!isWhisperCompatibleConfigured({ baseUrl: config.whisperBaseUrl })) {
    throw new Error('未配置 Whisper 兼容 ASR 地址')
  }
  const targetIds = input.sourceItemId ? [input.sourceItemId] : input.job.sourceItems.map((item) => item.id)
  const nextTracks = [...input.job.subtitleTracks]
  for (const sourceItemId of targetIds) {
    const sourceItem = input.job.sourceItems.find((item) => item.id === sourceItemId)
    if (!sourceItem) continue
    try {
      const asr = await transcribeWithWhisperCompatible(
        {
          baseUrl: config.whisperBaseUrl,
          apiKey: config.whisperApiKey,
          model: config.whisperModel,
          requestTimeoutMs: config.requestTimeoutMs,
        },
        { filePath: sourceItem.sourceVideoPath },
      )
      const fontPath = resolveSubtitleRenderFont(input.job.captionStyle.fontName).path
      const track = normalizeTrack(
        {
          sourceItemId: sourceItem.id,
          status: asr.cues.length ? 'completed' : 'failed',
          language: asr.language,
          cues: asr.cues.map((cue) => ({
            id: cue.id,
            startMs: cue.startMs,
            endMs: Math.max(cue.startMs + 120, cue.endMs),
            text: cue.text,
            lines: [cue.text],
          })),
          error: asr.cues.length ? undefined : 'ASR 未返回有效字幕',
          updatedAt: now(),
        },
        sourceItem.id,
        input.job.captionStyle,
        fontPath,
      )
      const index = nextTracks.findIndex((item) => item.sourceItemId === sourceItem.id)
      if (index >= 0) nextTracks[index] = track
      else nextTracks.push(track)
    } catch (error: any) {
      const failedTrack: BatchSubtitleTrack = {
        sourceItemId: sourceItem.id,
        status: 'failed',
        cues: [],
        error: String(error?.message || error || 'ASR 识别失败'),
        updatedAt: now(),
      }
      const index = nextTracks.findIndex((item) => item.sourceItemId === sourceItem.id)
      if (index >= 0) nextTracks[index] = failedTrack
      else nextTracks.push(failedTrack)
    }
  }
  return await webPlatformRepo.upsertBatchSubtitleJob({
    ...input.job,
    subtitleSource: 'whisper_compatible',
    subtitleTracks: nextTracks,
    updatedAt: now(),
  })
}

function createFailedOutput(input: {
  jobId: string
  sourceItem: BatchSubtitleSourceItem
  selectedTitle: string
  error: unknown
}): BatchSubtitleOutputItem {
  return {
    id: randomUUID(),
    jobId: input.jobId,
    sourceItemId: input.sourceItem.id,
    sourceVideoPath: input.sourceItem.sourceVideoPath,
    selectedTitle: input.selectedTitle,
    titleRenderMode: 'overlay_image',
    renderStatus: 'failed',
    error: String((input.error as any)?.message || input.error || '批量字幕渲染失败'),
    publishReady: false,
    publishStatus: 'idle',
    sourcePreserved: true,
    createdAt: now(),
    updatedAt: now(),
  }
}

function machineParallelism() {
  try {
    return Math.max(1, Number(availableParallelism()))
  } catch {
    return Math.max(1, cpus().length || 1)
  }
}

function defaultBatchSubtitleRenderBatchSize(job?: Pick<BatchSubtitleJob, 'subtitleMode' | 'titleRenderMode'>) {
  const fromEnv = Number(process.env.VG_BATCH_SUBTITLE_CONCURRENCY || 0)
  if (fromEnv > 0) return Math.max(1, Math.min(8, Math.floor(fromEnv)))
  const parallelism = machineParallelism()
  const preferBitmapOverlay = job?.subtitleMode === 'static_title' && job?.titleRenderMode !== 'ass_text'
  if (preferBitmapOverlay) {
    return Math.max(3, Math.min(6, Math.floor(parallelism / 2) || 3))
  }
  return Math.max(2, Math.min(4, Math.floor(parallelism / 3) || 2))
}

const BATCH_SUBTITLE_RENDER_BATCH_SIZE = defaultBatchSubtitleRenderBatchSize()

function batchSubtitleFfmpegThreads(batchSize: number) {
  const fromEnv = Number(process.env.VG_BATCH_SUBTITLE_FFMPEG_THREADS || 0)
  if (fromEnv > 0) return Math.max(1, Math.min(4, Math.floor(fromEnv)))
  const parallelism = machineParallelism()
  return Math.max(1, Math.min(2, Math.floor(parallelism / Math.max(1, batchSize)) || 1))
}

function shouldFlushBatchSubtitleProgress(input: {
  batchStart: number
  batchItemsLength: number
  totalRunnableCount: number
  lastPersistAt: number
  nowAt: number
}) {
  const isLastBatch = input.batchStart + input.batchItemsLength >= input.totalRunnableCount
  if (isLastBatch) return true
  return input.nowAt - input.lastPersistAt >= BATCH_SUBTITLE_PROGRESS_FLUSH_INTERVAL_MS
}

function shouldCheckBatchSubtitlePause(input: {
  batchStart: number
  batchItemsLength: number
  totalRunnableCount: number
  lastCheckedAt: number
  nowAt: number
}) {
  const isLastBatch = input.batchStart + input.batchItemsLength >= input.totalRunnableCount
  if (isLastBatch) return true
  return input.nowAt - input.lastCheckedAt >= BATCH_SUBTITLE_PAUSE_CHECK_INTERVAL_MS
}

async function yieldBatchSubtitleLoop() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function getBatchSubtitleJobOrThrow(userId: string, jobId: string) {
  const currentRaw = await webPlatformRepo.getBatchSubtitleJob(userId, jobId)
  if (!currentRaw) throw new Error('批量字幕任务不存在')
  return normalizeBatchSubtitleJob(currentRaw)
}

async function ensureBatchSubtitleJobNotPaused(userId: string, jobId: string) {
  const latest = await getBatchSubtitleJobOrThrow(userId, jobId)
  if (latest.status === 'paused') {
    throw new Error('__BATCH_SUBTITLE_PAUSED__')
  }
  return latest
}

async function renderSingleOutputAss(input: {
  job: BatchSubtitleJob
  sourceItem: BatchSubtitleSourceItem
  selectedTitle: string
  outputDir: string
  ffmpegThreads: number
  sharedFontsDir?: string
  sharedAssFontFamily?: string
}): Promise<BatchSubtitleOutputItem> {
  const { job, sourceItem, selectedTitle, outputDir, ffmpegThreads } = input
  const itemDir = join(outputDir, safeFsName(String(sourceItem.id || randomUUID())))
  await mkdir(itemDir, { recursive: true })
  const track = getTrackForSource(job, sourceItem.id)
  const assPath = await writeAssFile({
    job,
    sourceItem,
    selectedTitle,
    track,
    workDir: itemDir,
    fontsDir: input.sharedFontsDir,
    assFontFamily: input.sharedAssFontFamily,
  })
  const { assPath: assFilePath, fontsDir } = assPath
  const outputVideoPath = join(itemDir, `${basename(sourceItem.sourceVideoPath).replace(/\.[^.]+$/, '')}_subtitle.mp4`)
  await renderAssVideo({
    sourceItem,
    sourceVideoPath: sourceItem.sourceVideoPath,
    assPath: assFilePath,
    outputPath: outputVideoPath,
    fontsDir,
    ffmpegThreads,
  })
  const coverImagePath = String(sourceItem.coverImagePath || '').trim() || undefined
  return {
    id: randomUUID(),
    jobId: job.id,
    sourceItemId: sourceItem.id,
    sourceVideoPath: sourceItem.sourceVideoPath,
    outputVideoPath,
    coverImagePath,
    selectedTitle,
    titleRenderMode: 'ass_text',
    renderStatus: 'success',
    publishReady: true,
    publishStatus: 'idle',
    sourcePreserved: true,
    createdAt: now(),
    updatedAt: now(),
  }
}

async function renderSingleOutputBitmap(input: {
  job: BatchSubtitleJob
  sourceItem: BatchSubtitleSourceItem
  selectedTitle: string
  outputDir: string
  ffmpegThreads: number
}) {
  const { job, sourceItem, selectedTitle, outputDir, ffmpegThreads } = input
  const result = await renderBatchSubtitleVideoWithBitmapOverlay({
    sourceItem,
    titleConfig: {
      strategy: 'single_for_all',
      singleText: selectedTitle,
      titlePool: selectedTitle ? [selectedTitle] : [],
    },
    styleConfig: {
      ...job.styleConfig,
      fontName: job.overlayImageConfig?.fontName || job.captionStyle.fontName,
      fontSize: job.overlayImageConfig?.fontSize || job.captionStyle.fontSize,
      fontColor: job.overlayImageConfig?.fontColor || job.captionStyle.fontColor,
      strokeColor: job.overlayImageConfig?.strokeColor || job.captionStyle.strokeColor,
      strokeWidth: job.overlayImageConfig?.strokeWidth || job.captionStyle.strokeWidth,
      shadowColor: job.overlayImageConfig?.shadowColor || job.captionStyle.shadowColor,
      shadowBlur: job.overlayImageConfig?.shadowBlur || job.captionStyle.shadowBlur,
      position: job.overlayImageConfig?.position || job.captionStyle.position,
      safeMargin: job.overlayImageConfig?.safeMargin || job.captionStyle.safeMargin,
      textAlign: job.overlayImageConfig?.textAlign || job.captionStyle.textAlign,
      maxLines: job.overlayImageConfig?.maxLines || job.captionStyle.maxLines,
      maxWidthRatio: job.overlayImageConfig?.maxWidthRatio || job.captionStyle.maxWidthRatio,
      lineGap: job.overlayImageConfig?.lineGap || job.captionStyle.lineGap,
      bottomMargin: job.overlayImageConfig?.bottomMargin || job.captionStyle.bottomMargin,
      lineMode: 'multi',
    },
    outputDir,
    ffmpegThreads,
  })
  const coverImagePath = String(sourceItem.coverImagePath || '').trim() || undefined
  return {
    id: randomUUID(),
    jobId: job.id,
    sourceItemId: sourceItem.id,
    sourceVideoPath: sourceItem.sourceVideoPath,
    outputVideoPath: result.outputVideoPath,
    coverImagePath,
    selectedTitle,
    titleRenderMode: 'overlay_image' as const,
    overlayImagePath: result.overlayImagePath,
    renderStatus: 'success' as const,
    publishReady: true,
    publishStatus: 'idle' as const,
    sourcePreserved: true as const,
    createdAt: now(),
    updatedAt: now(),
  }
}

export async function reflowBatchSubtitleJob(input: {
  userId: string
  jobId: string
  sourceItemId?: string
}) {
  const currentRaw = await webPlatformRepo.getBatchSubtitleJob(input.userId, input.jobId)
  if (!currentRaw) throw new Error('批量字幕任务不存在')
  const current = normalizeBatchSubtitleJob(currentRaw)
  const sourceItemId = chooseSourceItemId(current, input.sourceItemId)
  const sourceItem = current.sourceItems.find((item) => item.id === sourceItemId)
  if (!sourceItem) throw new Error('未找到可重排的素材')
  const track = getTrackForSource(current, sourceItem.id)
  if (!track) throw new Error('请先录入字幕轨')
  const fontPath = resolveSubtitleRenderFont(current.captionStyle.fontName).path
  const nextTrack = normalizeTrack(
    {
      ...track,
      cues: track.cues.flatMap((cue) => splitCueByLines(cue, current.captionStyle, fontPath)),
      updatedAt: now(),
    },
    sourceItem.id,
    current.captionStyle,
    fontPath,
  )
  const next = await webPlatformRepo.upsertBatchSubtitleJob(upsertTrack(current, nextTrack))
  return next
}

export async function transcribeBatchSubtitleJob(input: {
  userId: string
  jobId: string
  sourceItemId?: string
}) {
  const currentRaw = await webPlatformRepo.getBatchSubtitleJob(input.userId, input.jobId)
  if (!currentRaw) throw new Error('?????????')
  const current = normalizeBatchSubtitleJob(currentRaw)
  const preparing = await webPlatformRepo.upsertBatchSubtitleJob({
    ...current,
    subtitleSource: 'whisper_compatible',
    updatedAt: now(),
  })
  return await transcribeBatchSubtitleJobInternal({
    userId: input.userId,
    job: preparing,
    sourceItemId: input.sourceItemId,
  })
}

export async function exportBatchSubtitleJobWithCapcut(input: { userId: string; jobId: string }) {
  const currentRaw = await webPlatformRepo.getBatchSubtitleJob(input.userId, input.jobId)
  if (!currentRaw) throw new Error('?????????')
  const current = normalizeBatchSubtitleJob(currentRaw)
  const config = await getBatchSubtitlePluginConfig(input.userId)
  if (!isCapcutMateConfigured({ baseUrl: config.capcutMateBaseUrl })) {
    throw new Error('??? capcut-mate ????')
  }
  const outputDir = join(getAppPaths().dataDir, 'batch-subtitle', input.userId, current.id)
  await mkdir(outputDir, { recursive: true })
  const queued = await webPlatformRepo.upsertBatchSubtitleJob({
    ...current,
    exportEngine: 'capcut_mate',
    status: 'processing',
    progress: 0,
    error: undefined,
    outputs: [],
    outputCount: 0,
    capcutDraft: {
      ...(current.capcutDraft || {}),
      status: 'processing',
      updatedAt: now(),
    },
  })
  const outputs: BatchSubtitleOutputItem[] = []
  const failures: string[] = []
  let lastDraft = queued.capcutDraft
  for (let index = 0; index < queued.sourceItems.length; index += 1) {
    const sourceItem = queued.sourceItems[index]
    try {
      const result = await renderSingleOutputByCapcut({
        job: queued,
        sourceItem,
        outputDir,
        config,
      })
      outputs.push(result.output)
      lastDraft = result.capcutDraft
    } catch (error: any) {
      outputs.push(
        createFailedOutput({
          jobId: queued.id,
          sourceItem,
          selectedTitle: titleForIndex(queued.titleConfig, index),
          error,
        }),
      )
      failures.push(`${sourceItem.fileName || sourceItem.id}: ${String(error?.message || error || 'capcut-mate ????')}`)
    }
    await webPlatformRepo.upsertBatchSubtitleJob({
      ...queued,
      progress: Math.round(((index + 1) / Math.max(1, queued.sourceItems.length)) * 100),
      outputCount: outputs.filter((item) => item.renderStatus === 'success').length,
      outputs: [...outputs],
      error: failures.length ? failures.join(' | ') : undefined,
      capcutDraft: lastDraft,
    })
  }
  const successCount = outputs.filter((item) => item.renderStatus === 'success').length
  const failedCount = outputs.filter((item) => item.renderStatus === 'failed').length
  return await webPlatformRepo.upsertBatchSubtitleJob({
    ...queued,
    status: successCount > 0 ? (failedCount > 0 ? 'partial_failed' : 'completed') : 'failed',
    progress: 100,
    outputCount: successCount,
    outputs,
    error: failures.length ? failures.join(' | ') : undefined,
    capcutDraft: {
      ...(lastDraft || {}),
      status: successCount > 0 ? 'completed' : 'failed',
      error: failures.length ? failures.join(' | ') : undefined,
      updatedAt: now(),
    },
  })
}

export async function runBatchSubtitleJob(input: { userId: string; jobId: string }) {
  let current = await getBatchSubtitleJobOrThrow(input.userId, input.jobId)
  const config = await getBatchSubtitlePluginConfig(input.userId)
  const shouldRunAsr =
    current.subtitleMode !== 'static_title' &&
    current.subtitleSource === 'whisper_compatible' &&
    current.subtitleTracks.every((item) => !item.cues.length)
  if (shouldRunAsr) {
    current = await transcribeBatchSubtitleJobInternal({
      userId: input.userId,
      job: current,
    })
    if (!current.subtitleTracks.some((item) => item.cues.length)) {
      throw new Error('ASR ????????')
    }
  }
  if (current.exportEngine === 'capcut_mate' && isCapcutMateConfigured({ baseUrl: config.capcutMateBaseUrl })) {
    try {
      return await exportBatchSubtitleJobWithCapcut(input)
    } catch (error) {
      if (!config.burnIn) throw error
    }
  }
  const outputDir = join(getAppPaths().dataDir, 'batch-subtitle', input.userId, current.id)
  await mkdir(outputDir, { recursive: true })
  const sharedAssFontsDir =
    current.titleRenderMode === 'ass_text' || current.subtitleMode !== 'static_title'
      ? await prepareFontsDirForSubtitles(join(outputDir, '_shared-ass'))
      : undefined
  const sharedAssFontFamily = sharedAssFontsDir
    ? await resolveAssFontFamilyForFontsDir(
        sharedAssFontsDir,
        String(current.captionStyle.fontName || defaultBatchSubtitleCaptionStyle().fontName || ASS_DEFAULT_FONT_FAMILY),
      )
    : undefined
  const existingOutputs = Array.isArray(current.outputs) ? [...current.outputs] : []
  const reusableSuccessOutputs = existingOutputs.filter(
    (item) => item.renderStatus === 'success' && String(item.outputVideoPath || '').trim(),
  )
  const reusableOutputMap = new Map(reusableSuccessOutputs.map((item) => [item.sourceItemId, item] as const))
  const failedOutputMap = new Map(
    existingOutputs
      .filter((item) => item.renderStatus === 'failed')
      .map((item) => [item.sourceItemId, item] as const),
  )
  const retryFailedOnly = current.status === 'failed'
  const pendingSourceItems = current.sourceItems.filter((item) => {
    if (reusableOutputMap.has(item.id)) return false
    if (!retryFailedOnly) return true
    return failedOutputMap.has(item.id)
  })
  const batchSize = Math.max(
    1,
    Number(current.batchRuntime?.batchSize || defaultBatchSubtitleRenderBatchSize(current) || BATCH_SUBTITLE_RENDER_BATCH_SIZE),
  )
  const ffmpegThreads = batchSubtitleFfmpegThreads(batchSize)
  const requestedStartIndex = Math.max(0, Number(current.batchRuntime?.nextSourceIndex || 0))
  const startOffset = pendingSourceItems.length ? Math.min(requestedStartIndex, pendingSourceItems.length - 1) : 0
  const runnableSourceItems = pendingSourceItems.slice(startOffset)
  const totalBatches = pendingSourceItems.length ? Math.ceil(pendingSourceItems.length / batchSize) : 0
  const completedBatches = pendingSourceItems.length
    ? Math.min(totalBatches, Math.floor(startOffset / batchSize))
    : 0
  const queued = await webPlatformRepo.upsertBatchSubtitleJob({
    ...current,
    exportEngine: 'ass_fallback',
    status: 'processing',
    progress: current.sourceItems.length
      ? Math.round((reusableSuccessOutputs.length / Math.max(1, current.sourceItems.length)) * 100)
      : 0,
    error: undefined,
    outputs: existingOutputs,
    outputCount: reusableSuccessOutputs.length,
    batchRuntime: {
      batchSize,
      nextSourceIndex: startOffset,
      totalBatches,
      completedBatches,
      lastBatchStartedAt: now(),
      lastBatchFinishedAt: current.batchRuntime?.lastBatchFinishedAt,
    },
  })
  const sourceIndexMap = new Map(queued.sourceItems.map((item, index) => [item.id, index] as const))
  const selectedTitleMap = new Map(
    queued.sourceItems.map((item) => {
      const sourceIndex = Math.max(0, Number(sourceIndexMap.get(item.id) ?? 0))
      return [item.id, getTitleForSource(queued, item.id, sourceIndex)] as const
    }),
  )
  const outputs: BatchSubtitleOutputItem[] = [...reusableSuccessOutputs]
  const outputBySourceItemId = new Map(reusableSuccessOutputs.map((item) => [item.sourceItemId, item] as const))
  let successCount = reusableSuccessOutputs.length
  const failures: string[] = []
  let lastProgressPersistAt = now()
  let lastPauseCheckAt = lastProgressPersistAt
  for (let batchStart = 0; batchStart < runnableSourceItems.length; batchStart += batchSize) {
    const batchItems = runnableSourceItems.slice(batchStart, batchStart + batchSize)
    const batchResults = await Promise.all(
      batchItems.map(async (sourceItem) => {
        const selectedTitle = selectedTitleMap.get(sourceItem.id) || ''
        try {
          const output =
            queued.subtitleMode === 'static_title' && queued.titleRenderMode !== 'ass_text'
              ? await renderSingleOutputBitmap({
                  job: queued,
                  sourceItem,
                  selectedTitle,
                  outputDir,
                  ffmpegThreads,
                })
              : await renderSingleOutputAss({
                  job: queued,
                  sourceItem,
                  selectedTitle,
                  outputDir,
                  ffmpegThreads,
                  sharedFontsDir: sharedAssFontsDir,
                  sharedAssFontFamily,
                })
          return {
            ok: true as const,
            sourceItem,
            output,
          }
        } catch (error: any) {
          return {
            ok: false as const,
            sourceItem,
            selectedTitle,
            error,
          }
        }
      }),
    )
    for (const result of batchResults) {
      if (result.ok) {
        outputs.push(result.output)
        outputBySourceItemId.set(result.sourceItem.id, result.output)
        successCount += 1
        failedOutputMap.delete(result.sourceItem.id)
        continue
      }
      const failedOutput = createFailedOutput({
        jobId: queued.id,
        sourceItem: result.sourceItem,
        selectedTitle: result.selectedTitle,
        error: result.error,
      })
      failedOutputMap.set(result.sourceItem.id, failedOutput)
      failures.push(
        `${result.sourceItem.fileName || result.sourceItem.id}: ${String(result.error?.message || result.error || '????????')}`,
      )
    }
    const processedCount = Math.min(startOffset + batchStart + batchItems.length, pendingSourceItems.length)
    const nextSourceIndex = Math.min(processedCount, pendingSourceItems.length)
    const progressPersistedAt = now()
    if (
      shouldFlushBatchSubtitleProgress({
        batchStart,
        batchItemsLength: batchItems.length,
        totalRunnableCount: runnableSourceItems.length,
        lastPersistAt: lastProgressPersistAt,
        nowAt: progressPersistedAt,
      })
    ) {
      const nextOutputs = queued.sourceItems
        .map(
          (item) =>
            reusableOutputMap.get(item.id) ||
            outputBySourceItemId.get(item.id) ||
            failedOutputMap.get(item.id),
        )
        .filter(Boolean) as BatchSubtitleOutputItem[]
      await webPlatformRepo.upsertBatchSubtitleJob({
        ...queued,
        progress: Math.round(
          ((reusableSuccessOutputs.length + processedCount) / Math.max(1, queued.sourceItems.length)) * 100,
        ),
        outputCount: successCount,
        outputs: nextOutputs,
        error: failures.length ? failures.join(' | ') : undefined,
        batchRuntime: {
          batchSize,
          nextSourceIndex,
          totalBatches,
          completedBatches: Math.min(totalBatches, Math.ceil(nextSourceIndex / batchSize)),
          lastBatchStartedAt:
            batchStart + batchItems.length < runnableSourceItems.length ? progressPersistedAt : queued.batchRuntime?.lastBatchStartedAt,
          lastBatchFinishedAt: progressPersistedAt,
        },
      })
      lastProgressPersistAt = progressPersistedAt
    }
    if (
      shouldCheckBatchSubtitlePause({
        batchStart,
        batchItemsLength: batchItems.length,
        totalRunnableCount: runnableSourceItems.length,
        lastCheckedAt: lastPauseCheckAt,
        nowAt: progressPersistedAt,
      })
    ) {
      try {
        await ensureBatchSubtitleJobNotPaused(input.userId, input.jobId)
        lastPauseCheckAt = progressPersistedAt
      } catch (error: any) {
        if (String(error?.message || error) === '__BATCH_SUBTITLE_PAUSED__') {
          return await getBatchSubtitleJobOrThrow(input.userId, input.jobId)
        }
        throw error
      }
    }
    await yieldBatchSubtitleLoop()
  }
  const finalOutputs = queued.sourceItems
    .map((item) => reusableOutputMap.get(item.id) || outputBySourceItemId.get(item.id) || failedOutputMap.get(item.id))
    .filter(Boolean) as BatchSubtitleOutputItem[]
  const failedCount = finalOutputs.filter((item) => item.renderStatus === 'failed').length
  return await webPlatformRepo.upsertBatchSubtitleJob({
    ...queued,
    status: successCount > 0 ? (failedCount > 0 ? 'partial_failed' : 'completed') : 'failed',
    progress: 100,
    outputCount: successCount,
    outputs: finalOutputs,
    error: failures.length ? failures.join(' | ') : undefined,
    batchRuntime: {
      batchSize,
      nextSourceIndex: 0,
      totalBatches,
      completedBatches: totalBatches,
      lastBatchStartedAt: queued.batchRuntime?.lastBatchStartedAt,
      lastBatchFinishedAt: now(),
    },
  })
}

export async function pauseBatchSubtitleJob(input: { userId: string; jobId: string }) {
  const current = await getBatchSubtitleJobOrThrow(input.userId, input.jobId)
  return await webPlatformRepo.upsertBatchSubtitleJob({
    ...current,
    status: 'paused',
    updatedAt: now(),
  })
}

export async function resumeBatchSubtitleJob(input: { userId: string; jobId: string; retryFailedOnly?: boolean }) {
  const current = await getBatchSubtitleJobOrThrow(input.userId, input.jobId)
  const prepared = await webPlatformRepo.upsertBatchSubtitleJob({
    ...current,
    status: input.retryFailedOnly ? 'failed' : current.status === 'paused' ? 'queued' : current.status,
    error: undefined,
    updatedAt: now(),
  })
  return await runBatchSubtitleJob({
    userId: input.userId,
    jobId: prepared.id,
  })
}

export async function listBatchSubtitleOutputs(userId: string) {
  const jobs = await webPlatformRepo.listBatchSubtitleJobs(userId)
  return jobs.flatMap((item) => item.outputs || []).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
}

export async function previewBatchSubtitleFrame(input: {
  userId: string
  sourceItem: BatchSubtitleSourceItem
  subtitleMode?: BatchSubtitleMode
  titleConfig?: BatchSubtitleTitleConfig
  titleItems?: BatchSubtitleTitleItem[]
  titleRenderMode?: BatchSubtitleTitleRenderMode
  overlayImageConfig?: Partial<BatchSubtitleOverlayImageConfig>
  styleConfig?: BatchSubtitleStyleConfig
  captionStyle?: Partial<BatchSubtitleCaptionStyle>
  layoutPolicy?: Partial<BatchSubtitleLayoutPolicy>
  subtitleTrack?: Partial<BatchSubtitleTrack>
  previewAtSec?: number
  includeVideo?: boolean
}): Promise<BatchSubtitlePreviewResult> {
  const sourceItem = await enrichBatchSubtitleSourceItem(input.sourceItem)
  const subtitleMode = normalizeMode(input.subtitleMode)
  const captionStyle = normalizeCaptionStyle(input.captionStyle)
  const job: BatchSubtitleJob = {
    id: 'preview',
    userId: input.userId,
    name: 'preview',
    sourceItems: [sourceItem],
    subtitleMode,
    subtitleSource: 'manual',
    exportEngine: 'ass_fallback',
    titleRenderMode: normalizeTitleRenderMode(input.titleRenderMode),
    titleConfig: {
      ...defaultBatchSubtitleTitleConfig(),
      ...(input.titleConfig || {}),
    },
    styleConfig: normalizeStyleConfig(input.styleConfig),
    captionStyle,
    titleItems: normalizeTitleItems(
      [sourceItem],
      {
        ...defaultBatchSubtitleTitleConfig(),
        ...(input.titleConfig || {}),
      },
      input.titleItems,
    ),
    overlayImageConfig: normalizeOverlayImageConfig(input.overlayImageConfig, captionStyle),
    layoutPolicy: normalizeLayoutPolicy(input.layoutPolicy),
    subtitleTracks: [
      normalizeTrack(
        input.subtitleTrack as any,
        sourceItem.id,
        captionStyle,
        resolveSubtitleRenderFont(captionStyle.fontName).path,
      ),
    ],
    status: 'draft' as BatchSubtitleJobStatus,
    progress: 0,
    outputCount: 0,
    outputs: [],
    capcutDraft: undefined,
    createdAt: now(),
    updatedAt: now(),
  }
  if (job.subtitleMode === 'static_title' && job.titleRenderMode !== 'ass_text') {
    const previewAtSec =
      typeof input.previewAtSec === 'number'
        ? input.previewAtSec
        : 1
    const bitmap = await generateBatchSubtitlePreviewFrameByRemotion({
      sourceItem,
      titleConfig: {
        strategy: 'single_for_all',
        singleText: getTitleForSource(job, sourceItem.id, 0),
        titlePool: getTitleForSource(job, sourceItem.id, 0) ? [getTitleForSource(job, sourceItem.id, 0)] : [],
      },
      styleConfig: {
        ...job.styleConfig,
        fontName: job.overlayImageConfig?.fontName || job.captionStyle.fontName,
        fontSize: job.overlayImageConfig?.fontSize || job.captionStyle.fontSize,
        fontColor: job.overlayImageConfig?.fontColor || job.captionStyle.fontColor,
        strokeColor: job.overlayImageConfig?.strokeColor || job.captionStyle.strokeColor,
        strokeWidth: job.overlayImageConfig?.strokeWidth || job.captionStyle.strokeWidth,
        shadowColor: job.overlayImageConfig?.shadowColor || job.captionStyle.shadowColor,
        shadowBlur: job.overlayImageConfig?.shadowBlur || job.captionStyle.shadowBlur,
        position: job.overlayImageConfig?.position || job.captionStyle.position,
        safeMargin: job.overlayImageConfig?.safeMargin || job.captionStyle.safeMargin,
        textAlign: job.overlayImageConfig?.textAlign || job.captionStyle.textAlign,
        maxLines: job.overlayImageConfig?.maxLines || job.captionStyle.maxLines,
        maxWidthRatio: job.overlayImageConfig?.maxWidthRatio || job.captionStyle.maxWidthRatio,
        lineGap: job.overlayImageConfig?.lineGap || job.captionStyle.lineGap,
        bottomMargin: job.overlayImageConfig?.bottomMargin || job.captionStyle.bottomMargin,
        lineMode: 'multi',
      },
      overlayConfig: job.overlayImageConfig,
      previewAtSec,
      includeVideo: input.includeVideo === true,
    })
    return {
      ...bitmap,
      titleRenderMode: 'overlay_image',
      overlayAsset: {
        sourceItemId: sourceItem.id,
        titleText: getTitleForSource(job, sourceItem.id, 0),
        overlayImagePath: bitmap.overlayImagePath,
        overlayPreviewPath: bitmap.previewImagePath,
        generatedAt: bitmap.generatedAt,
      },
      renderedMode: job.subtitleMode,
    }
  }
  const workDir = join(
    getAppPaths().dataDir,
    'batch-subtitle-preview',
    safeFsName(sourceItem.id || 'preview'),
    String(Date.now()),
  )
  await mkdir(workDir, { recursive: true })
  const selectedTitle = titleForIndex(job.titleConfig, 0)
  const track = getTrackForSource(job, sourceItem.id)
  const assRender = await writeAssFile({
    job,
    sourceItem,
    selectedTitle,
    track,
    workDir,
    previewAtSec: input.previewAtSec,
  })
  const previewImagePath = join(workDir, `${basename(sourceItem.sourceVideoPath).replace(/\.[^.]+$/, '')}_preview.png`)
  const previewVideoPath = join(workDir, `${basename(sourceItem.sourceVideoPath).replace(/\.[^.]+$/, '')}_preview.mp4`)
  const previewAtSec =
    typeof input.previewAtSec === 'number'
      ? input.previewAtSec
      : track?.cues?.[0]
        ? Math.max(0, track.cues[0].startMs / 1000)
        : 1
  await renderAssVideo({
    sourceItem,
    sourceVideoPath: sourceItem.sourceVideoPath,
    assPath: assRender.assPath,
    outputPath: previewVideoPath,
    fontsDir: assRender.fontsDir,
    previewAtSec,
    clipSec: 2.5,
  })
  const previewPosterPath = (await generateThumbnailJpg({ filePath: previewVideoPath, atSec: 0.8 })) || previewVideoPath
  return {
    sourceItemId: sourceItem.id,
    previewImagePath: previewPosterPath,
    overlayImagePath: assRender.assPath,
    previewVideoPath,
    previewPosterPath,
    previewAtSec,
    activeCueId: track?.cues?.find((cue: BatchSubtitleCue) => previewAtSec * 1000 >= cue.startMs && previewAtSec * 1000 <= cue.endMs)?.id,
    activeCueText: track?.cues?.find((cue: BatchSubtitleCue) => previewAtSec * 1000 >= cue.startMs && previewAtSec * 1000 <= cue.endMs)?.text,
    activeCueLines: track?.cues?.find((cue: BatchSubtitleCue) => previewAtSec * 1000 >= cue.startMs && previewAtSec * 1000 <= cue.endMs)?.lines,
    renderedMode: job.subtitleMode,
    generatedAt: now(),
  }
}

export async function pushBatchSubtitleOutputsToGeelarkPool(input: { userId: string; jobId: string }) {
  const current = await webPlatformRepo.getBatchSubtitleJob(input.userId, input.jobId)
  if (!current) throw new Error('批量字幕任务不存在')
  const publishableOutputs = current.outputs.filter((item) => item.renderStatus === 'success' && item.outputVideoPath)
  if (!publishableOutputs.length) throw new Error('当前任务暂无可发布的成功输出')
  const nextOutputs = current.outputs.map((item) => ({
    ...item,
    publishReady: item.renderStatus === 'success' && Boolean(item.outputVideoPath),
    publishStatus: item.renderStatus === 'success' && item.outputVideoPath ? ('queued' as const) : item.publishStatus,
    updatedAt: now(),
  }))
  return await webPlatformRepo.upsertBatchSubtitleJob({
    ...current,
    outputs: nextOutputs,
  })
}

export async function generateBatchSubtitleTitles(input: {
  userId: string
  prompt: string
  count?: number
  contentLanguage?: string
}) {
  const credentials = await cloneRepo.getCredentials()
  const language = String(input.contentLanguage || 'zh-CN').trim()
  const ask =
    language === 'en-US'
      ? `Generate ${Math.max(3, Math.min(12, Number(input.count || 6)))} short TikTok title candidates in English, one title per line, no numbering. Topic: ${input.prompt}`
      : `生成 ${Math.max(3, Math.min(12, Number(input.count || 6)))} 条适合短视频标题贴片的文案，每行一条，不要编号。主题：${input.prompt}`
  const result = await generateChatCompletion({
    credentials,
    system: '只输出标题候选，每行一条，不要解释。',
    prompt: ask,
  })
  const titles = String(result.content || '')
    .split(/\r?\n/)
    .map((item) => item.replace(/^[\d.\-\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, Math.max(3, Math.min(12, Number(input.count || 6))))
  return {
    titles,
    content: result.content,
    provider: result.provider,
    model: result.model,
  }
}

export async function generateBatchSubtitleViralTitles(input: {
  userId: string
  jobId?: string
  sourceItems: BatchSubtitleSourceItem[]
  language?: 'vi' | 'en' | 'zh'
  tone?: 'hook' | 'conversion' | 'emotional'
  sellingPoints?: string
  symbolIntensity?: 'low' | 'medium' | 'high'
}) {
  const credentials = await cloneRepo.getCredentials()
  const enrichedItems = await Promise.all(
    (input.sourceItems || []).map(async (item) => {
      return await enrichBatchSubtitleSourceItem({
        id: String(item.id || randomUUID()),
        sourceType: item.sourceType,
        sourceVideoPath: String(item.sourceVideoPath || '').trim(),
        sourceProjectId: typeof item.sourceProjectId === 'string' ? item.sourceProjectId : undefined,
        sourceProjectTitle: typeof item.sourceProjectTitle === 'string' ? item.sourceProjectTitle : undefined,
        fileName: typeof item.fileName === 'string' ? item.fileName : undefined,
        coverImagePath: typeof item.coverImagePath === 'string' ? item.coverImagePath : undefined,
        durationSec: typeof item.durationSec === 'number' ? item.durationSec : undefined,
        width: typeof item.width === 'number' ? item.width : undefined,
        height: typeof item.height === 'number' ? item.height : undefined,
      })
    }),
  )
  const config = normalizeViralTitleConfig({
    language: input.language,
    tone: input.tone,
    sellingPoints: input.sellingPoints,
    symbolIntensity: input.symbolIntensity,
    generationMode: 'video_content',
  })
  const analysisItems = enrichedItems.map((item) => buildViralTitleAnalysisSummary(item))
  const titleItems: BatchSubtitleTitleItem[] = []
  const contents: string[] = []
  let provider = ''
  let model = ''

  for (const analysis of analysisItems) {
    const result = await generateChatCompletion({
      credentials,
      system: 'Write only one viral short-video title. No explanation.',
      prompt: buildViralTitlePrompt({ analysis, config }),
    })
    const title = cleanGeneratedTitle(result.content) || cleanGeneratedTitle(analysis.subject || '') || 'Xem là muốn mua ngay!'
    titleItems.push({
      sourceItemId: analysis.sourceItemId,
      text: title,
      updatedAt: now(),
    })
    contents.push(result.content)
    provider = result.provider
    model = result.model
  }

  if (input.jobId) {
    const current = await getBatchSubtitleJobOrThrow(input.userId, input.jobId)
    await webPlatformRepo.upsertBatchSubtitleJob({
      ...current,
      titleStyleMode: 'vn_tiktok_viral',
      viralTitleConfig: config,
      titleAnalysisItems: analysisItems,
      titleItems: normalizeTitleItems(current.sourceItems, current.titleConfig, titleItems),
      updatedAt: now(),
    })
  }

  return {
    titleItems,
    analysisItems,
    titleStyleMode: 'vn_tiktok_viral' as const,
    content: contents.join('\n'),
    provider,
    model,
  }
}

export async function buildBatchSubtitlePublishCandidates(userId: string): Promise<GeelarkClonePublishCandidate[]> {
  const outputs = await listBatchSubtitleOutputs(userId)
  const jobs = await webPlatformRepo.listBatchSubtitleJobs(userId)
  const jobMap = new Map(jobs.map((item) => [item.id, item]))
  return outputs
    .filter((item) => item.publishReady && item.renderStatus === 'success' && item.outputVideoPath)
    .map((item) => {
      const job = jobMap.get(item.jobId)
      const source = job?.sourceItems.find((row) => row.id === item.sourceItemId)
      return {
        cloneProjectId: item.id,
        sourceType: 'batch_subtitle_output' as const,
        sourceProjectId: source?.sourceProjectId,
        sourceJobId: item.jobId,
        sourceOutputId: item.id,
        title: item.selectedTitle || source?.fileName || item.id,
        coverAssetPath: String(item.coverImagePath || '').trim(),
        finalOutputPath: item.outputVideoPath!,
        referenceVideoName: source?.fileName || '',
        referenceVideoPath: source?.sourceVideoPath || item.sourceVideoPath,
        productReferenceImagePaths: [],
        updatedAt: item.updatedAt,
        publishedStatus: (item.publishStatus === 'queued' ? 'published' : 'unpublished') as 'published' | 'unpublished',
      }
    })
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
}
